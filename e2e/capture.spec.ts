// Phase 6 acceptance: all three operator flows, from a new examinee to saved scores. It uses only the
// synthetic demo pack. Saved rows are read with the raw browser API, and expected values were traced
// by hand through the legacy rules, using the pair from the legacy Protocolo screenshot.
import { type Page, expect, test } from '@playwright/test';

const SERIE_1 = '01234567';
const SERIE_2 = '32165470';

interface Dump {
  examinees: { id: string; birthDate: string }[];
  sessions: { id: string; ageAtTest: number; maritalStatus: string; testDate: string; instruments: Record<string, boolean>; profile: { id: string }; contentVersion: string; engineVersion: string; textSeed: string }[];
  colorResults: { serie1: string; serie2: string; protocol: { serie2: { signs: string } }; qualitative: unknown[] }[];
  itemAnswers: { itemId: string; given: string | null; correct: boolean | null; points: number }[];
  scores: { traitId: string; value: number; textId: string | null }[];
}

function dump(page: Page): Promise<Dump> {
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
    const out: Record<string, unknown> = {};
    for (const name of db.objectStoreNames) {
      out[name] = await new Promise((resolve) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => {
          resolve(request.result);
        };
      });
    }
    db.close();
    return out as unknown as Dump;
  });
}

const scoresOf = (data: Dump): Record<string, number> => Object.fromEntries(data.scores.map((s) => [s.traitId, s.value]));

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar con contenido de demostración' }).click();
  await expect(page.getByRole('heading', { name: 'Examinados' })).toBeVisible();
}

/** New examinee, then their page, then the session form. Born 15 June 1990 and tested on their 30th birthday. */
async function newSessionFor(page: Page, instrument: string, sex: 'Femenino' | 'Masculino' = 'Femenino', birth = '1990-06-15', testDate = '2020-06-15'): Promise<void> {
  await page.getByText('Agregar examinado').first().click();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellido paterno').fill('Núñez');
  await page.getByLabel('Sexo').selectOption({ label: sex });
  await page.getByLabel('Fecha de nacimiento').fill(birth);
  await page.getByRole('button', { name: 'Agregar examinado' }).click();
  await page.getByRole('link', { name: 'Ana Núñez' }).click();
  await page.getByRole('link', { name: 'Nueva sesión' }).click();
  await page.getByLabel('Prueba', { exact: true }).selectOption({ label: instrument });
  await page.getByLabel('Fecha de la prueba').fill(testDate);
  await page.getByLabel('Perfil del puesto').selectOption({ label: 'Puesto de demostración' });
}

async function fillSeries(page: Page): Promise<void> {
  await page.getByLabel('Serie 1').fill(SERIE_1);
  await page.getByLabel('Serie 2').fill(SERIE_2);
}

async function setTotals(page: Page, verbal: number, numeric: number, spatial: number): Promise<void> {
  for (const [label, value] of [['Total Verbal', verbal], ['Total Numérico', numeric], ['Total Espacial', spatial]] as const) {
    await page.getByLabel(label).fill(String(value));
    await page.getByLabel(label).blur();
  }
}

const P4_HAND_TRACED = { 'p4:24': 50, 'p4:25': 40, 'p4:26': 80, 'p4:27': 50, 'p4:23': 51, 'p4:13': 45, 'p4:14': 30, 'p4:15': 50, 'p4:16': 85, 'p4:17': 90, 'p4:18': 60, 'p4:19': 80, 'p4:20': 90, 'p4:21': 55 };

test('Colores, from a new examinee to saved scores', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'Colores');
  await expect(page.getByText('Edad en la fecha de la prueba: 30 años')).toBeVisible();
  await page.getByLabel('Estado civil').selectOption('CASADA');
  await page.getByRole('button', { name: 'Empezar captura' }).click();

  // Saving is off until both series are complete and valid, as in ValidaSerie.
  const save = page.getByRole('button', { name: 'Guardar y terminar' });
  await expect(save).toBeDisabled();
  await page.getByLabel('Serie 1').fill('0123');
  await page.getByLabel('Serie 1').fill('01231');
  await expect(page.getByRole('alert')).toContainText('El número 1 ya está en la serie');
  await page.getByLabel('Serie 1').fill('8');
  await expect(page.getByRole('alert')).toContainText('solamente números del 0 al 7');
  await fillSeries(page);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await save.click();
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();

  const data = await dump(page);
  expect(data.sessions).toHaveLength(1);
  expect(data.sessions[0]).toMatchObject({
    ageAtTest: 30,
    maritalStatus: 'CASADA',
    testDate: '2020-06-15',
    instruments: { color: true, ci: false, ce: false },
    profile: { id: 'factory:2' },
    contentVersion: 'demo-1',
    engineVersion: '1',
  });
  expect(data.sessions[0]?.textSeed).toBe(data.sessions[0]?.id);
  expect(data.colorResults[0]).toMatchObject({ serie1: SERIE_1, serie2: SERIE_2, protocol: { serie2: { signs: '++X==___' } } });
  expect(data.colorResults[0]?.qualitative.length).toBeGreaterThan(10);
  expect(scoresOf(data)).toEqual(P4_HAND_TRACED);
  expect(data.scores.every((s) => s.textId !== null)).toBe(true);
  expect(data.itemAnswers).toEqual([]);
});

test('C.I., from a new examinee to saved scores, with totals and ticks', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'C.I.');
  await page.getByRole('button', { name: 'Empezar captura' }).click();

  // A typed total ticks that many from the top. Ticking updates the totals.
  await setTotals(page, 10, 8, 6);
  await expect(page.getByRole('group', { name: 'Verbal' }).getByRole('checkbox', { checked: true })).toHaveCount(10);
  await expect(page.getByRole('group', { name: 'Numérico' }).getByRole('checkbox', { checked: true })).toHaveCount(8);
  await expect(page.getByRole('group', { name: 'Espacial' }).getByRole('checkbox', { checked: true })).toHaveCount(6);
  await page.getByRole('group', { name: 'Espacial' }).getByRole('checkbox').nth(11).check();
  await expect(page.getByLabel('Total Espacial')).toHaveValue('7');
  await page.getByRole('group', { name: 'Espacial' }).getByRole('checkbox').nth(11).uncheck();
  await expect(page.getByLabel('Total Espacial')).toHaveValue('6');

  // A total out of range is ignored, as in legacy.
  await page.getByLabel('Total Verbal').fill('13');
  await page.getByLabel('Total Verbal').blur();
  await expect(page.getByLabel('Total Verbal')).toHaveValue('10');
  await page.getByLabel('Total Verbal').fill('x');
  await page.getByLabel('Total Verbal').blur();
  await expect(page.getByLabel('Total Verbal')).toHaveValue('10');

  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();

  const data = await dump(page);
  expect(data.sessions[0]?.instruments).toEqual({ color: false, ci: true, ce: false });
  // The demo's band for ages 18-30 is 50 + raw * 2. Factors look up raw * 3, and global looks up the sum.
  expect(scoresOf(data)).toEqual({ 'p4:28': 98, 'p4:29': 110, 'p4:31': 98, 'p4:30': 86 });
  expect(data.itemAnswers).toHaveLength(36);
  expect(data.itemAnswers.filter((a) => a.correct).length).toBe(24);
  expect(data.scores.every((s) => s.textId === null)).toBe(true);
});

test('C.I. asks before saving all factors at zero', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'C.I.');
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('suman cero');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  expect((await dump(page)).scores).toEqual([]);
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await page.getByRole('button', { name: 'Sí, guardar' }).click();
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();
  expect(scoresOf(await dump(page))).toMatchObject({ 'p4:28': 50 });
});

test('C.E., from a new examinee to saved scores', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'C.E.', 'Masculino');
  await expect(page.getByLabel('Estado civil').getByRole('option', { name: 'SOLTERO' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Empezar captura' }).click();

  const save = page.getByRole('button', { name: 'Guardar y terminar' });
  await fillSeries(page);
  await expect(save).toBeDisabled();
  for (let n = 1; n <= 29; n++) await page.getByRole('group', { name: `Pregunta ${String(n)}`, exact: true }).getByRole('radio', { name: 'A' }).check();
  await expect(page.getByText('29 de 30 respuestas capturadas')).toBeVisible();
  await expect(save).toBeDisabled();

  // A question has one answer: choosing another replaces it.
  const last = page.getByRole('group', { name: 'Pregunta 30', exact: true });
  await last.getByRole('radio', { name: 'C' }).check();
  await last.getByRole('radio', { name: 'A' }).check();
  await expect(last.getByRole('radio', { checked: true })).toHaveCount(1);
  await expect(page.getByText('30 de 30 respuestas capturadas')).toBeVisible();

  await save.click();
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();

  const data = await dump(page);
  expect(data.sessions[0]).toMatchObject({ instruments: { color: false, ci: false, ce: true }, maritalStatus: 'SOLTERO' });
  expect(data.itemAnswers).toHaveLength(30);
  expect(data.itemAnswers.every((a) => a.given === 'A' && a.points === 2)).toBe(true);
  expect(data.colorResults[0]?.qualitative).toEqual([]);
  expect(data.scores).toHaveLength(15);
  // Each factor has 5 items at 2 points, so raw 10 adds 30 or 40 to the hand-traced bases.
  expect(scoresOf(data)).toMatchObject({ 'ce:19': 90, 'ce:20': 75, 'ce:21': 100, 'ce:22': 100, 'ce:23': 90, 'ce:24': 85, 'ce:26': 90, 'ce:25': 58, 'ce:27': 74 });
});

test('the combined Colores to C.I. flow saves both in one session', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'Colores');
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await fillSeries(page);
  await page.getByRole('button', { name: 'Guardar y pasar al C.I.' }).click();
  await expect(page.getByRole('heading', { name: 'C.I.' })).toBeVisible();

  // Color is already on disk, so closing here can't lose it.
  expect((await dump(page)).sessions[0]?.instruments.color).toBe(true);
  await expect(page.getByRole('button', { name: 'Guardar y pasar a Colores' })).toHaveCount(0);

  await setTotals(page, 10, 8, 6);
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();

  const data = await dump(page);
  expect(data.sessions).toHaveLength(1);
  expect(data.sessions[0]?.instruments).toEqual({ color: true, ci: true, ce: false });
  expect(data.scores).toHaveLength(18);
  expect(scoresOf(data)).toEqual({ ...P4_HAND_TRACED, 'p4:28': 98, 'p4:29': 110, 'p4:31': 98, 'p4:30': 86 });
});

test('the reverse C.I. to Colores flow also works', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'C.I.');
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await setTotals(page, 10, 8, 6);
  await page.getByRole('button', { name: 'Guardar y pasar a Colores' }).click();
  await expect(page.getByRole('heading', { name: 'Colores' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar y pasar al C.I.' })).toHaveCount(0);
  await fillSeries(page);
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();
  expect((await dump(page)).scores).toHaveLength(18);
});

test('a saved instrument cannot be entered twice', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'Colores');
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await fillSeries(page);
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();
  const before = await dump(page);
  const id = before.sessions[0]?.id ?? '';
  // Changing only the hash keeps the page, and the pack, open.
  await page.goto(`/#/sesiones/${id}/color`);
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();
  await expect(page.getByLabel('Serie 1')).toHaveCount(0);
  expect((await dump(page)).scores).toEqual(before.scores);
});

test('an unfinished session can be resumed from the examinee page', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'Colores');
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await fillSeries(page);
  await page.getByRole('button', { name: 'Guardar y pasar al C.I.' }).click();
  await expect(page.getByRole('heading', { name: 'C.I.' })).toBeVisible();
  await page.getByRole('link', { name: 'PsIV' }).click();
  await page.getByRole('link', { name: 'Ana Núñez' }).click();
  await expect(page.getByText('Colores', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Capturar C.I.' }).click();
  await expect(page.getByRole('heading', { name: 'C.I.' })).toBeVisible();
});

test('C.I. is blocked under 18 with a clear message, and Colores still works', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'C.I.', 'Femenino', '2005-03-01', '2020-03-01');
  await expect(page.getByText('Edad en la fecha de la prueba: 15 años')).toBeVisible();
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await expect(page.getByRole('alert')).toContainText('No se puede calificar el C.I. con una edad de 15 años');
  expect((await dump(page)).sessions).toEqual([]);

  await page.getByLabel('Prueba', { exact: true }).selectOption({ label: 'Colores' });
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await expect(page.getByLabel('Serie 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar y pasar al C.I.' })).toHaveCount(0);
  await expect(page.getByText('El C.I. no se puede calificar')).toBeVisible();
});

test('the session form rejects a bad test date', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'Colores', 'Femenino', '1990-06-15', '1980-01-01');
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await expect(page.getByRole('alert')).toContainText('anterior a la fecha de nacimiento');
  expect((await dump(page)).sessions).toEqual([]);
});

test('a session can be deleted after confirming, and the examinee can be edited', async ({ page }) => {
  await start(page);
  await newSessionFor(page, 'Colores');
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await fillSeries(page);
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: /^INFORME/ })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al examinado' }).click();

  await page.getByRole('button', { name: 'Editar datos' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana María');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('heading', { name: 'Ana María Núñez' })).toBeVisible();

  await page.getByRole('button', { name: /Eliminar la sesión/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  expect((await dump(page)).sessions).toHaveLength(1);
  await page.getByRole('button', { name: /Eliminar la sesión/ }).click();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page.getByText('Todavía no hay sesiones.')).toBeVisible();
  expect(await dump(page)).toMatchObject({ sessions: [], scores: [], colorResults: [] });
  expect((await dump(page)).examinees).toHaveLength(1);
});
