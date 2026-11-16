// Phase 5 acceptance: a backup restores identically in a fresh browser profile. Each profile is a
// separate user-data folder on disk, and every value here is made up.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, type Page, chromium, expect, test } from '@playwright/test';

const URL_BASE = 'http://127.0.0.1:4180/';
const BACKUP_PASSPHRASE = 'frase de prueba para el respaldo';

const folders: string[] = [];
const contexts: BrowserContext[] = [];

async function freshProfile(): Promise<Page> {
  const folder = mkdtempSync(join(tmpdir(), 'psiv-profile-'));
  folders.push(folder);
  const context = await chromium.launchPersistentContext(folder, { acceptDownloads: true });
  contexts.push(context);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(URL_BASE);
  await page.getByRole('button', { name: 'Probar con contenido de demostración' }).click();
  await expect(page.getByRole('heading', { name: 'Examinados' })).toBeVisible();
  return page;
}

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close()));
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** Reads every store with the raw browser API, independently of the app's own code. */
function dump(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('psiv');
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(new Error('open failed'));
      };
    });
    const sorted = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sorted);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
      }
      return value;
    };
    const out: Record<string, unknown> = {};
    for (const name of [...db.objectStoreNames].sort()) {
      out[name] = await new Promise((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => {
          resolve(sorted(request.result));
        };
        request.onerror = () => {
          reject(new Error('read failed'));
        };
      });
    }
    db.close();
    return JSON.stringify(out);
  });
}

/** Adds rows to every other store, because the screens for them come in later phases. */
function seedOtherStores(page: Page): Promise<void> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('psiv');
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(new Error('open failed'));
      };
    });
    const names = ['examinees', 'sessions', 'colorResults', 'itemAnswers', 'scores', 'customProfiles', 'appMeta', 'invitations'];
    const tx = db.transaction(names, 'readwrite');
    const first = await new Promise<{ id: string }>((resolve) => {
      const request = tx.objectStore('examinees').getAll();
      request.onsuccess = () => {
        resolve((request.result as { id: string }[])[0] ?? { id: '' });
      };
    });
    const side = { signs: '+XX====_', marks: '.', letters: '.' };
    tx.objectStore('sessions').put({
      id: 'sesion-1',
      examineeId: first.id,
      testDate: '2026-01-10',
      ageAtTest: 35,
      maritalStatus: 'Soltera',
      instruments: { color: true, ci: true, ce: false },
      profile: { id: 'factory:2', name: 'Puesto', hasRanges: true, ranges: { 'p4:13': { min: 30, max: 70 } } },
      contentVersion: 'demo-1',
      engineVersion: '1',
      normProfileId: 'latam',
      administration: 'paper',
      textSeed: 'sesion-1',
    });
    tx.objectStore('colorResults').put({
      sessionId: 'sesion-1',
      serie1: '01234567',
      serie2: '76543210',
      protocol: { serie1: side, serie2: side },
      qualitative: [{ slot: 1, baseCode: 'CA00', textId: 'p4:1' }],
    });
    tx.objectStore('itemAnswers').put({ sessionId: 'sesion-1', itemId: 'ci:1', given: null, correct: true, points: 1 });
    tx.objectStore('scores').put({ sessionId: 'sesion-1', traitId: 'p4:13', value: 55, textId: 'p4:2' });
    tx.objectStore('customProfiles').put({ id: 'perfil-1', name: 'Mi perfil', locked: false, hasRanges: true, modules: ['p4'], ranges: { 'p4:13': { min: 1, max: 2 } }, company: '', position: 'Mi perfil', textProfileId: 'factory:1' });
    tx.objectStore('appMeta').put({ key: 'ajuste', value: { a: [1, 2], b: 'ñandú' } });
    tx.objectStore('invitations').put({ id: 'invitacion-1', examineeId: first.id, tests: ['color'], profileId: 'factory:1', normProfileId: 'latam', maritalStatus: null, createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z', token: 'a.b', importedAt: null, sessionId: null });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  });
}

async function addExaminee(page: Page, given: string, paternal: string, maternal: string, birth: string): Promise<void> {
  if (!(await page.getByLabel('Nombre', { exact: true }).isVisible())) await page.getByText('Agregar examinado').first().click();
  await page.getByLabel('Nombre', { exact: true }).fill(given);
  await page.getByLabel('Apellido paterno').fill(paternal);
  await page.getByLabel('Apellido materno').fill(maternal);
  await page.getByLabel('Fecha de nacimiento').fill(birth);
  await page.getByRole('button', { name: 'Agregar examinado' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: `${given} ${paternal}` })).toBeVisible();
}

async function downloadBackup(page: Page, path: string): Promise<void> {
  await page.getByLabel('Frase de acceso del respaldo').fill(BACKUP_PASSPHRASE);
  await page.getByLabel('Repite la frase de acceso').fill(BACKUP_PASSPHRASE);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Crear respaldo' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^psiv-respaldo-\d{4}-\d{2}-\d{2}\.psivbackup$/);
  await download.saveAs(path);
  await expect(page.getByText('Respaldo creado y comprobado')).toBeVisible();
}

test('a backup restores identically in a fresh browser profile', async () => {
  const work = mkdtempSync(join(tmpdir(), 'psiv-backup-'));
  folders.push(work);
  const file = join(work, 'respaldo.psivbackup');

  const original = await freshProfile();
  await addExaminee(original, 'Ana', 'Núñez', 'García', '1990-06-15');
  await addExaminee(original, 'Luis', 'Pérez', '', '1985-02-01');
  await seedOtherStores(original);
  await downloadBackup(original, file);
  const before = await dump(original);
  expect(JSON.parse(before)).toMatchObject({ sessions: [{ id: 'sesion-1' }], invitations: [{ id: 'invitacion-1' }] });

  const restored = await freshProfile();
  expect(JSON.parse(await dump(restored))).toMatchObject({ examinees: [], sessions: [] });
  await restored.getByLabel('Archivo de respaldo').setInputFiles(file);

  // A wrong passphrase fails cleanly and changes nothing.
  await restored.getByLabel('Frase de acceso', { exact: true }).fill('una frase equivocada');
  await restored.getByRole('button', { name: 'Revisar respaldo' }).click();
  await expect(restored.getByRole('alert')).toContainText('frase de acceso es incorrecta');
  expect(JSON.parse(await dump(restored))).toMatchObject({ examinees: [] });

  await restored.getByLabel('Frase de acceso', { exact: true }).fill(BACKUP_PASSPHRASE);
  await restored.getByRole('button', { name: 'Revisar respaldo' }).click();
  await expect(restored.getByRole('alertdialog')).toContainText('2 examinados y 1 sesión');
  await restored.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(restored.getByText('Respaldo restaurado')).toBeVisible();

  expect(await dump(restored)).toBe(before);
  await expect(restored.getByRole('listitem').filter({ hasText: 'Ana Núñez' })).toBeVisible();

  // It's on disk, not only in memory.
  await restored.reload();
  await restored.getByRole('button', { name: 'Probar con contenido de demostración' }).click();
  await expect(restored.getByRole('listitem').filter({ hasText: 'Ana Núñez' })).toBeVisible();
  expect(await dump(restored)).toBe(before);
});

test('restoring over existing data warns first, and cancel keeps the data', async () => {
  const work = mkdtempSync(join(tmpdir(), 'psiv-backup-'));
  folders.push(work);
  const file = join(work, 'respaldo.psivbackup');

  const page = await freshProfile();
  await addExaminee(page, 'Ana', 'Núñez', 'García', '1990-06-15');
  await downloadBackup(page, file);
  await addExaminee(page, 'Luis', 'Pérez', '', '1985-02-01');
  const before = await dump(page);

  await page.getByLabel('Archivo de respaldo').setInputFiles(file);
  await page.getByLabel('Frase de acceso', { exact: true }).fill(BACKUP_PASSPHRASE);
  await page.getByRole('button', { name: 'Revisar respaldo' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('reemplazará todos los datos');

  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(await dump(page)).toBe(before);

  await page.getByRole('button', { name: 'Revisar respaldo' }).click();
  await page.getByRole('button', { name: 'Reemplazar mis datos' }).click();
  await expect(page.getByText('Respaldo restaurado')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Luis Pérez' })).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: 'Ana Núñez' })).toBeVisible();
});

test('search and cascading delete, with confirmation', async () => {
  const page = await freshProfile();
  await addExaminee(page, 'Ana', 'Núñez', 'García', '1990-06-15');
  await addExaminee(page, 'Luis', 'Pérez', '', '1985-02-01');
  await seedOtherStores(page);

  await page.getByLabel('Buscar por nombre').fill('nunez');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Buscar por nombre').fill('zzz');
  await expect(page.getByText('No hay resultados.')).toBeVisible();
  await page.getByLabel('Buscar por nombre').fill('');
  await expect(page.getByRole('listitem')).toHaveCount(2);

  const owner = JSON.parse(await dump(page)) as { sessions: { examineeId: string }[]; examinees: { id: string; givenName: string }[] };
  const name = owner.examinees.find((e) => e.id === owner.sessions[0]?.examineeId)?.givenName ?? '';
  const row = page.getByRole('button', { name: new RegExp(`Eliminar a ${name}`) });

  // Cancel keeps everything.
  await row.click();
  await expect(page.getByRole('alertdialog')).toContainText('1 sesión y 1 puntuación');
  const before = await dump(page);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(await dump(page)).toBe(before);

  // Confirming removes the person and all their rows.
  await row.click();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(1);
  expect(JSON.parse(await dump(page))).toMatchObject({ sessions: [], colorResults: [], itemAnswers: [], scores: [] });
});

test('the form rejects a bad birth date', async () => {
  const page = await freshProfile();
  await page.getByText('Agregar examinado').first().click();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellido paterno').fill('Núñez');
  await page.getByLabel('Fecha de nacimiento').fill('1850-01-01');
  await page.getByRole('button', { name: 'Agregar examinado' }).click();
  await expect(page.getByRole('alert')).toContainText('fecha de nacimiento válida');
  expect(JSON.parse(await dump(page))).toMatchObject({ examinees: [] });
});
