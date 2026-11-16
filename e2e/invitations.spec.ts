// Phase 10 acceptance: a link opened in a clean browser produces a code that imports and scores. It
// uses only the synthetic demo pack. The examinee runs in a separate browser context, with no shared
// storage, which is the same as another person's computer.
import { type Browser, type Page, expect, test } from '@playwright/test';

const SERIE_1 = '01234567';
const SERIE_2 = '32165470';
const GIVEN_NAME = 'Ximena';

async function operator(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar con contenido de demostración' }).click();
  await expect(page.getByRole('heading', { name: 'Examinados' })).toBeVisible();
  await page.getByText('Agregar examinado').first().click();
  await page.getByLabel('Nombre', { exact: true }).fill(GIVEN_NAME);
  await page.getByLabel('Apellido paterno').fill('Quiroga');
  await page.getByLabel('Apellido materno').fill('Zubieta');
  await page.getByLabel('Sexo').selectOption({ label: 'Femenino' });
  await page.getByLabel('Fecha de nacimiento').fill('1990-06-15');
  await page.getByRole('button', { name: 'Agregar examinado' }).click();
  await page.getByRole('link', { name: new RegExp(GIVEN_NAME) }).first().click();
  await expect(page.getByRole('heading', { name: new RegExp(GIVEN_NAME) })).toBeVisible();
  return page;
}

async function createLink(page: Page, tests: string): Promise<string> {
  await page.getByRole('link', { name: 'Invitar por enlace' }).click();
  await page.getByLabel('Pruebas').selectOption(tests);
  await page.getByRole('button', { name: 'Crear enlace' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Invitación creada' })).toBeVisible();
  return page.getByLabel('Enlace para enviar').inputValue();
}

async function openLink(browser: Browser, link: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(link);
  return page;
}

async function consent(page: Page): Promise<void> {
  // The box sits next to its text, inside the panel.
  const box = await page.getByRole('checkbox').boundingBox();
  const label = await page.locator('label.check').boundingBox();
  const panel = await page.locator('.panel').boundingBox();
  expect(box?.width).toBeLessThan(40);
  expect((label?.x ?? 0) + (label?.width ?? 0)).toBeLessThanOrEqual((panel?.x ?? 0) + (panel?.width ?? 0));
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Indicaciones' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

async function pick(page: Page, order: string): Promise<void> {
  for (const digit of order.slice(0, 7)) await page.locator(`[data-color="${digit}"]`).click();
}

async function colors(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Prueba de colores' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await pick(page, SERIE_1);
  await expect(page.getByRole('heading', { name: 'Pausa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saltar espera' })).toBeDisabled();
  await page.clock.fastForward('03:05');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Segunda elección' })).toBeVisible();
  await pick(page, SERIE_2);
}

async function finishAndGetCode(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Generar mi código' }).click();
  await expect(page.getByRole('heading', { name: 'Envíe sus respuestas' })).toBeVisible();
  return page.getByLabel('Código').inputValue();
}

async function importCode(page: Page, code: string): Promise<void> {
  await page.getByRole('link', { name: 'Invitaciones', exact: true }).click();
  await page.getByLabel('O pega el código').fill(code);
  await page.getByRole('button', { name: 'Abrir respuesta' }).click();
  await page.getByLabel('Fecha de la prueba').fill('2020-06-15');
  await page.getByRole('button', { name: 'Importar y calificar' }).click();
  await expect(page.getByRole('heading', { name: 'Informe', exact: false }).first()).toBeVisible();
}

/** A reload in the instant after a click can beat the write, so this waits until it's on disk. */
async function savedProgress(page: Page, field: string, expected: unknown): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async (name) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open('psiv-examinee');
          request.onsuccess = () => {
            resolve(request.result);
          };
        });
        const rows = await new Promise<Record<string, unknown>[]>((resolve) => {
          const request = db.transaction('progress').objectStore('progress').getAll();
          request.onsuccess = () => {
            resolve(request.result as Record<string, unknown>[]);
          };
        });
        db.close();
        return rows[0]?.[name];
      }, field),
    )
    .toEqual(expected);
}

function readDb(page: Page): Promise<Record<string, Record<string, unknown>[]>> {
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
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const name of db.objectStoreNames) {
      out[name] = await new Promise((resolve) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => {
          resolve(request.result as Record<string, unknown>[]);
        };
      });
    }
    db.close();
    return out;
  });
}

test('Color and CI: a clean browser answers, and the operator imports and scores', async ({ browser }) => {
  const staff = await operator(browser);
  const link = await createLink(staff, 'color,ci');

  // The token holds no name, birth date, answer key or operator passphrase.
  const token = link.split('#/e/')[1] ?? '';
  const payload = Buffer.from((token.split('.')[0] ?? '').replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
  expect(Object.keys(JSON.parse(payload) as object).sort()).toEqual(['e', 'i', 'k', 's', 't', 'u', 'v', 'x']);
  for (const secret of [GIVEN_NAME, 'Quiroga', 'Zubieta', '1990-06-15']) expect(payload).not.toContain(secret);

  const examinee = await openLink(browser, link);
  await consent(examinee);
  await colors(examinee);
  await expect(examinee.getByRole('heading', { name: 'Prueba de razonamiento' })).toBeVisible();
  await examinee.getByRole('button', { name: 'Continuar' }).click();

  // The demo shows a visible stand-in, not a blank square.
  await expect.poll(() => examinee.locator('.ci-image').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(100);

  // The answer to question 1 is the demo key's: index 1 % 5 is "b".
  await examinee.getByRole('radio', { name: 'b' }).check();
  await examinee.getByRole('button', { name: 'Siguiente' }).click();

  // Resumes from a reload at the same question, with the answer kept.
  await expect(examinee.getByRole('heading', { name: 'Pregunta 2 de 36' })).toBeVisible();
  await savedProgress(examinee, 'ciIndex', 1);
  await examinee.reload();
  await expect(examinee.getByRole('heading', { name: 'Pregunta 2 de 36' })).toBeVisible();
  await examinee.getByRole('button', { name: 'Anterior' }).click();
  await expect(examinee.getByRole('radio', { name: 'b' })).toBeChecked();

  for (let n = 1; n < 36; n++) await examinee.getByRole('button', { name: 'Siguiente' }).click();
  await examinee.getByRole('button', { name: 'Terminar esta prueba' }).click();
  await expect(examinee.getByRole('alert')).toContainText('Faltan 35');
  await examinee.getByRole('button', { name: 'Terminar de todos modos' }).click();
  const code = await finishAndGetCode(examinee);
  expect(code).toMatch(/^PSIVR1\./);

  // The readable answers are gone from the examinee's browser, and the code survives a reload.
  await examinee.reload();
  await expect(examinee.getByLabel('Código')).toHaveValue(code);

  await importCode(staff, code);
  await expect(staff.getByText('Administración en pantalla', { exact: false }).first()).toBeVisible();

  const data = await readDb(staff);
  const session = data.sessions?.[0];
  expect(session).toMatchObject({ administration: 'screen', ageAtTest: 30, testDate: '2020-06-15', instruments: { color: true, ci: true, ce: false } });
  expect(data.colorResults?.[0]).toMatchObject({ serie1: SERIE_1, serie2: SERIE_2 });
  expect(data.itemAnswers).toHaveLength(36);
  expect(data.itemAnswers?.filter((a) => a.correct === true).map((a) => a.itemId)).toEqual(['ci:1']);
  expect(data.scores).toHaveLength(18);
  expect(data.invitations?.[0]).toMatchObject({ sessionId: session?.id });

  // The same code can't be imported twice.
  await staff.getByRole('link', { name: 'Invitaciones', exact: true }).click();
  await staff.getByLabel('O pega el código').fill(code);
  await staff.getByRole('button', { name: 'Abrir respuesta' }).click();
  await expect(staff.getByRole('alert')).toContainText('ya se importó');
});

test('CE: takes both color series and all the questions', async ({ browser }) => {
  const staff = await operator(browser);
  const examinee = await openLink(browser, await createLink(staff, 'ce'));
  await consent(examinee);
  await colors(examinee);
  await expect(examinee.getByRole('heading', { name: 'Cuestionario' })).toBeVisible();
  await examinee.getByRole('button', { name: 'Continuar' }).click();

  // Each question must be answered before moving on.
  await expect(examinee.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  for (let n = 1; n <= 30; n++) {
    await expect(examinee.getByRole('heading', { name: `Pregunta ${String(n)} de 30` })).toBeVisible();
    await examinee.getByRole('radio', { name: 'Opción de demostración A' }).check();
    await examinee.getByRole('button', { name: n === 30 ? 'Terminar esta prueba' : 'Siguiente' }).click();
  }
  await importCode(staff, await finishAndGetCode(examinee));

  const data = await readDb(staff);
  expect(data.sessions?.[0]).toMatchObject({ administration: 'screen', instruments: { color: false, ci: false, ce: true } });
  expect(data.itemAnswers).toHaveLength(30);
  expect(data.scores).toHaveLength(15);
});

test('the wait between questions holds across a reload, and applies only going forward', async ({ browser }) => {
  const staff = await operator(browser);
  await staff.getByRole('link', { name: 'Invitar por enlace' }).click();
  await staff.getByLabel('Pruebas').selectOption('ci');
  await staff.getByLabel('Segundos entre preguntas').fill('-1');
  await staff.getByRole('button', { name: 'Crear enlace' }).click();
  await expect(staff.getByRole('alert')).toContainText('de 0 a 600');
  await staff.getByLabel('Segundos entre preguntas').fill('20');
  await staff.getByRole('button', { name: 'Crear enlace' }).click();
  const examinee = await openLink(browser, await staff.getByLabel('Enlace para enviar').inputValue());
  await consent(examinee);
  await examinee.getByRole('button', { name: 'Continuar' }).click();

  await examinee.getByRole('button', { name: 'Siguiente' }).click();
  await expect(examinee.getByRole('heading', { name: 'Espere un momento' })).toBeVisible();
  await expect(examinee.getByRole('heading', { name: 'Pregunta 2 de 36' })).toHaveCount(0);
  await expect.poll(() => examinee.getByRole('timer').textContent()).toMatch(/en (19|20) s/);

  await savedProgress(examinee, 'ciIndex', 1);
  await examinee.reload();
  await expect(examinee.getByRole('heading', { name: 'Espere un momento' })).toBeVisible();

  await examinee.clock.fastForward('00:21');
  await expect(examinee.getByRole('heading', { name: 'Pregunta 2 de 36' })).toBeVisible();
  await examinee.getByRole('button', { name: 'Anterior' }).click();
  await expect(examinee.getByRole('heading', { name: 'Pregunta 1 de 36' })).toBeVisible();

  // The examinee can skip the wait, and the skip is saved.
  await examinee.getByRole('button', { name: 'Siguiente' }).click();
  await examinee.getByRole('button', { name: 'Continuar ahora' }).click();
  await expect(examinee.getByRole('heading', { name: 'Pregunta 2 de 36' })).toBeVisible();
  await savedProgress(examinee, 'waitUntil', null);
  await examinee.reload();
  await expect(examinee.getByRole('heading', { name: 'Pregunta 2 de 36' })).toBeVisible();
});

async function invite(staff: Page, pauseSeconds: string): Promise<string> {
  await staff.getByRole('link', { name: 'Invitar por enlace' }).click();
  await staff.getByLabel('Pruebas').selectOption('color');
  await staff.getByLabel('Segundos de pausa entre colores').fill(pauseSeconds);
  await staff.getByRole('button', { name: 'Crear enlace' }).click();
  return staff.getByLabel('Enlace para enviar').inputValue();
}

async function toFirstSelection(page: Page): Promise<void> {
  await consent(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await pick(page, SERIE_1);
}

test('the Color gap: the sender sets it, and three answers unlock the skip', async ({ browser }) => {
  const staff = await operator(browser);
  const examinee = await openLink(browser, await invite(staff, '600'));
  await toFirstSelection(examinee);
  await expect(examinee.getByRole('timer')).toContainText('10:00');

  const answers = examinee.locator('.panel input');
  await expect(answers).toHaveCount(3);
  const skip = examinee.getByRole('button', { name: 'Saltar espera' });
  await answers.nth(0).fill('Jazz');
  await answers.nth(1).fill('Tacos');
  await expect(skip).toBeDisabled();

  // The answers and the same questions come back after a reload.
  const firstQuestion = await examinee.locator('.panel label').first().textContent();
  await savedProgress(examinee, 'pauseAnswers', ['Jazz', 'Tacos', '']);
  await examinee.reload();
  await expect(examinee.locator('.panel label').first()).toHaveText(firstQuestion ?? '');
  await expect(answers.nth(0)).toHaveValue('Jazz');

  await answers.nth(2).fill('Perú');
  await expect(skip).toBeEnabled();
  await skip.click();
  await expect(examinee.getByRole('heading', { name: 'Segunda elección' })).toBeVisible();
  await savedProgress(examinee, 'pauseAnswers', []);
});

test('the Color gap can be turned off', async ({ browser }) => {
  const staff = await operator(browser);
  const examinee = await openLink(browser, await invite(staff, '0'));
  await toFirstSelection(examinee);
  await expect(examinee.getByRole('heading', { name: 'Segunda elección' })).toBeVisible();
});

test('a damaged link shows an error and no test', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/#/e/abc.def');
  await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Probar con contenido de demostración' })).toHaveCount(0);
});

test('an edited link is refused', async ({ browser }) => {
  const staff = await operator(browser);
  const link = await createLink(staff, 'color');
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${link.slice(0, -3)}AAA`);
  await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toBeVisible();
});

test('a code from another operator is refused', async ({ browser }) => {
  const first = await operator(browser);
  const link = await createLink(first, 'color');
  const examinee = await openLink(browser, link);
  await consent(examinee);
  await colors(examinee);
  const code = await finishAndGetCode(examinee);

  const second = await operator(browser);
  await createLink(second, 'color');
  await second.getByRole('link', { name: 'Invitaciones', exact: true }).click();
  await second.getByLabel('O pega el código').fill(code);
  await second.getByRole('button', { name: 'Abrir respuesta' }).click();
  await expect(second.getByRole('alert')).toContainText('otras claves');
});

test('the examinee can erase their code from the device', async ({ browser }) => {
  const staff = await operator(browser);
  const examinee = await openLink(browser, await createLink(staff, 'color'));
  await consent(examinee);
  await colors(examinee);
  await finishAndGetCode(examinee);
  await examinee.getByRole('button', { name: 'Borrar de este equipo' }).click();
  await examinee.getByRole('button', { name: 'Sí, borrar de este equipo' }).click();
  await expect(examinee.getByRole('heading', { name: 'Listo' })).toBeVisible();
});
