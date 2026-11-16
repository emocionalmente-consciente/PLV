// Phase 9 acceptance: one session renders under both norm profiles with the correct label and unchanged
// scores. It uses only the synthetic demo pack.
import { type Page, expect, test } from '@playwright/test';

const SERIE_1 = '01234567';
// Azul in sixth place, where the demo's México-only note applies.
const SERIE_2 = '32045167';

async function newSession(page: Page, instrument: string, norm?: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar con contenido de demostración' }).click();
  await page.getByText('Agregar examinado').first().click();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellido paterno').fill('Núñez');
  await page.getByLabel('Fecha de nacimiento').fill('1990-06-15');
  await page.getByRole('button', { name: 'Agregar examinado' }).click();
  await page.getByRole('link', { name: 'Ana Núñez' }).click();
  await page.getByRole('link', { name: 'Nueva sesión' }).click();
  await page.getByLabel('Prueba', { exact: true }).selectOption({ label: instrument });
  await page.getByLabel('Fecha de la prueba').fill('2020-06-15');
  await page.getByLabel('Perfil del puesto').selectOption({ label: 'Puesto de demostración' });
  if (norm) await page.getByLabel('Referencia').selectOption({ label: norm });
  await page.getByRole('button', { name: 'Empezar captura' }).click();
}

async function colorSession(page: Page, norm?: string): Promise<void> {
  await newSession(page, 'Colores', norm);
  await page.getByLabel('Serie 1').fill(SERIE_1);
  await page.getByLabel('Serie 2').fill(SERIE_2);
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: 'INFORME PSICOLABORAL' })).toBeVisible();
}

function stored(page: Page): Promise<{ normProfileId: string; scores: unknown[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('psiv');
      request.onsuccess = () => {
        resolve(request.result);
      };
    });
    const read = <T,>(name: string): Promise<T[]> =>
      new Promise((resolve) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => {
          resolve(request.result as T[]);
        };
      });
    const [sessions, scores] = await Promise.all([read<{ normProfileId: string }>('sessions'), read('scores')]);
    db.close();
    return { normProfileId: sessions[0]?.normProfileId ?? '', scores };
  });
}

const traitHeadings = (page: Page): Promise<string[]> => page.locator('.report-trait h4').allInnerTexts();
const LATAM_LABEL = 'Referencia latinoamericana.';
const EUROPA_LABEL = 'Referencia europea para Colores; C.I. y C.E. con tablas LatAm.';

test('one session renders under both profiles with the correct label and unchanged scores', async ({ page }) => {
  await colorSession(page);
  const before = await stored(page);
  expect(before.normProfileId).toBe('latam');

  await expect(page.locator('.norm-label')).toHaveText(LATAM_LABEL);
  const latamScores = await traitHeadings(page);
  expect(latamScores.length).toBeGreaterThan(0);
  const latamTable = await page.locator('.norm-reference tbody').innerText();
  await expect(page.locator('.norm-notes')).toContainText('Nota de demostración sobre el Azul');

  await page.getByLabel('Ver con la referencia').selectOption({ label: 'Europa (Lüscher)' });
  await expect(page.locator('.norm-label')).toHaveText(EUROPA_LABEL);
  await expect(page.locator('.norm-view-note')).toContainText('Latinoamérica');
  expect(await traitHeadings(page)).toEqual(latamScores);
  expect(await page.locator('.norm-reference tbody').innerText()).not.toBe(latamTable);
  await expect(page.locator('.norm-notes')).toHaveCount(0);
  await expect(page.getByText('Solo como referencia')).toBeVisible();

  // Looking at another profile changes nothing that was saved.
  expect(await stored(page)).toEqual(before);

  await page.getByLabel('Ver con la referencia').selectOption({ label: 'Latinoamérica (la de la sesión)' });
  await expect(page.locator('.norm-label')).toHaveText(LATAM_LABEL);
  await expect(page.locator('.norm-view-note')).toHaveCount(0);
});

test('a session stores the profile chosen on its form', async ({ page }) => {
  await colorSession(page, 'Europa (Lüscher)');
  await expect(page.locator('.norm-label')).toHaveText(EUROPA_LABEL);
  expect((await stored(page)).normProfileId).toBe('europa-luscher');
  await expect(page.locator('.norm-view-note')).toHaveCount(0);
});

test('a session with no Color test has the label but no color reference', async ({ page }) => {
  await newSession(page, 'C.I.');
  await page.getByLabel('Total Verbal').fill('5');
  await page.getByLabel('Total Verbal').blur();
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: 'INFORME PSICOLABORAL' })).toBeVisible();
  await expect(page.locator('.norm-label')).toHaveText(LATAM_LABEL);
  await expect(page.locator('.norm-reference')).toHaveCount(0);
});

test('the label and reference print, and the selector does not', async ({ page }) => {
  await colorSession(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.norm-label')).toBeVisible();
  await expect(page.locator('.norm-reference')).toBeVisible();
  await expect(page.locator('.norm-select')).toBeHidden();
});
