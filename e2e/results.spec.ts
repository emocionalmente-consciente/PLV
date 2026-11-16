// Phase 7: results screens and printing, using only the synthetic demo pack.
import { type Page, expect, test } from '@playwright/test';

const SERIE_1 = '01234567';
const SERIE_2 = '32165470';

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar con contenido de demostración' }).click();
  await expect(page.getByRole('heading', { name: 'Examinados' })).toBeVisible();
}

async function newSession(page: Page, instrument: string, given = 'Ana', paternal = 'Núñez'): Promise<void> {
  if (!(await page.getByLabel('Nombre', { exact: true }).isVisible())) await page.getByText('Agregar examinado').first().click();
  await page.getByLabel('Nombre', { exact: true }).fill(given);
  await page.getByLabel('Apellido paterno').fill(paternal);
  await page.getByLabel('Fecha de nacimiento').fill('1990-06-15');
  await page.getByRole('button', { name: 'Agregar examinado' }).click();
  await page.getByRole('link', { name: `${given} ${paternal}` }).click();
  await page.getByRole('link', { name: 'Nueva sesión' }).click();
  await page.getByLabel('Prueba', { exact: true }).selectOption({ label: instrument });
  await page.getByLabel('Fecha de la prueba').fill('2020-06-15');
  await page.getByLabel('Perfil del puesto').selectOption({ label: 'Puesto de demostración' });
  await page.getByRole('button', { name: 'Empezar captura' }).click();
}

async function fillSeries(page: Page): Promise<void> {
  await page.getByLabel('Serie 1').fill(SERIE_1);
  await page.getByLabel('Serie 2').fill(SERIE_2);
}

async function colorAndCi(page: Page): Promise<void> {
  await newSession(page, 'Colores');
  await fillSeries(page);
  await page.getByRole('button', { name: 'Guardar y pasar al C.I.' }).click();
  for (const [label, value] of [['Total Verbal', '10'], ['Total Numérico', '8'], ['Total Espacial', '6']] as const) {
    await page.getByLabel(label).fill(value);
    await page.getByLabel(label).blur();
  }
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: 'INFORME PSICOLABORAL' })).toBeVisible();
}

async function ceSession(page: Page): Promise<void> {
  await newSession(page, 'C.E.');
  await fillSeries(page);
  for (let n = 1; n <= 30; n++) await page.getByRole('group', { name: `Pregunta ${String(n)}`, exact: true }).getByRole('radio', { name: 'A' }).check();
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: 'INFORME', exact: true })).toBeVisible();
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

test('the P4 report shows the header, CI block, texts and traits in order', async ({ page }) => {
  await start(page);
  await colorAndCi(page);

  await expect(page.getByText('Ana Núñez').first()).toBeVisible();
  await expect(page.getByText('Puesto: Puesto de demostración').first()).toBeVisible();
  await expect(page.getByText('Lunes, 15 de junio de 2020').first()).toBeVisible();
  await expect(page.getByText('Edad: 30').first()).toBeVisible();
  await expect(page.getByText('Sexo: Femenino').first()).toBeVisible();

  await expect(page.getByRole('heading', { name: 'I. PERFIL INTELECTUAL:' })).toBeVisible();
  await expect(page.getByText('Puntuación global bruta')).toBeVisible();
  await expect(page.locator('.report-ci').getByRole('row', { name: /Factor Verbal 110/ })).toBeVisible();

  const text = await page.locator('.sheet').first().innerText();
  const at = (needle: string): number => text.indexOf(needle);
  expect(at('PERFIL INTELECTUAL')).toBeGreaterThan(-1);
  expect(at('Texto de demostración CA00')).toBeGreaterThan(at('Factor Numérico'));
  expect(at('Texto de demostración CJ00')).toBeLessThan(at('Rasgo de demostración p4:13'));
  expect(at('Rasgo de demostración p4:21')).toBeLessThan(at('Texto de demostración CK01'));
  expect(at('Texto de demostración CK01')).toBeLessThan(at('IV. INTELIGENCIA EMOCIONAL'));
  expect(at('IV. INTELIGENCIA EMOCIONAL')).toBeLessThan(at('Texto de demostración CL00'));
  await expect(page.getByRole('heading', { name: /p4:16 85/ })).toBeVisible();
});

test('a report without C.I. says so', async ({ page }) => {
  await start(page);
  await newSession(page, 'Colores');
  await fillSeries(page);
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: 'I. Perfil Intelectual No Aplicado' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Capturar C.I.' })).toBeVisible();
});

test('the CE report lists its traits', async ({ page }) => {
  await start(page);
  await ceSession(page);
  await expect(page.locator('.report-trait')).toHaveCount(15);
  await expect(page.getByRole('heading', { name: /ce:27 74/ })).toBeVisible();
});

test('the protocol matches the legacy screenshot', async ({ page }) => {
  await start(page);
  await colorAndCi(page);
  await page.getByRole('link', { name: 'Protocolo' }).click();
  await expect(page.locator('.protocol')).toBeVisible();
  const rows = page.locator('.protocol tr');
  const cells = async (i: number): Promise<string[]> => (await rows.nth(i).locator('td').allInnerTexts()).map((s) => s.trim());
  expect(await cells(0)).toEqual(['C', '', '', '', '', '', '', 'A']);
  expect(await cells(1)).toEqual(['!!!', '', '', '', '', '', '', '']);
  expect(await cells(2)).toEqual(['+', 'X', 'X', '=', '=', '=', '=', '−']);
  expect((await cells(3)).join('')).toBe(SERIE_1);
  expect((await cells(4)).join('')).toBe(SERIE_2);
  expect(await cells(5)).toEqual(['+', '+', 'X', '=', '=', '−', '−', '−']);
  expect(await cells(6)).toEqual(['', '', '', '', '', '!', '', '']);
  expect(await cells(7)).toEqual(['C', '', '', '', '', 'A', 'A', 'A']);
});

test('the chart shows three series, compares profiles, and hides ranges with no profile', async ({ page }) => {
  await start(page);
  await colorAndCi(page);
  await page.getByRole('link', { name: 'Gráfica' }).click();
  const chart = page.locator('.chart-screen');
  await expect(chart.locator('.recharts-bar')).toHaveCount(3);
  await expect(chart.locator('.recharts-legend-item')).toHaveText(['Mínimo', 'Máximo', 'Examen']);
  await expect(page.locator('.chart-name')).toHaveText('Ana Núñez');
  await expect(page.locator('.chart-profile-name')).toHaveText('Puesto de demostración');

  await page.getByText('Ver datos en tabla').click();
  await expect(page.getByRole('row', { name: /p4:16 30 70 85/ })).toBeVisible();

  await page.getByLabel('Comparar con el perfil').selectOption({ label: 'Sin perfil' });
  await expect(chart.locator('.recharts-bar')).toHaveCount(1);
  await expect(chart.locator('.recharts-legend-item')).toHaveCount(0);
  await expect(page.locator('.chart-profile-name')).toHaveText('Sin perfil');
});

test('the surface view keeps real values and the semaphore colors', async ({ page }) => {
  await start(page);
  await colorAndCi(page);
  await page.getByRole('link', { name: 'Gráfica' }).click();
  const chart = page.locator('.chart-screen');
  await expect(chart.locator('.recharts-bar')).toHaveCount(3);

  await page.getByLabel('Tipo de gráfica').selectOption({ label: 'Superficie (apilada)' });
  await expect(chart.locator('.recharts-area')).toHaveCount(3);
  await expect(chart.locator('.recharts-bar')).toHaveCount(0);
  await expect(chart.locator('.recharts-legend-item')).toHaveText(['Mínimo', 'Máximo', 'Examen']);
  await expect(page.locator('.chart-print .recharts-area')).toHaveCount(3);

  // The axis stays on the score scale, so the stack never shows a sum.
  const ticks = await chart.locator('.recharts-yAxis-tick-labels text, .recharts-yAxis .recharts-cartesian-axis-tick-value').allTextContents();
  expect(Math.max(...ticks.map(Number))).toBeLessThanOrEqual(150);

  const colors = await page.evaluate(() => ['minimum', 'maximum', 'score'].map((name) => getComputedStyle(document.documentElement).getPropertyValue(`--series-${name}`).trim()));
  expect(colors).toEqual(['#c62828', '#43a047', '#2a78d6']);

  await page.getByLabel('Comparar con el perfil').selectOption({ label: 'Sin perfil' });
  await expect(chart.locator('.recharts-area')).toHaveCount(1);
});

test('the 3D view puts the examinee in front, turns, and shows values', async ({ page }) => {
  await start(page);
  await colorAndCi(page);
  await page.getByRole('link', { name: 'Gráfica' }).click();
  await page.getByLabel('Tipo de gráfica').selectOption({ label: 'Barras 3D (interactiva)' });
  const chart = page.locator('.chart-screen');
  const bars = chart.locator('.bar3d');
  await expect(bars).toHaveCount(54);
  await expect(chart.locator('.chart3d-legend li')).toHaveText(['Examen (al frente)', 'Mínimo (atrás)', 'Máximo (al fondo)']);
  await expect(page.locator('.chart-print .bar3d')).toHaveCount(54);

  // Farthest first, so the last one drawn is the nearest.
  await expect(bars.last()).toHaveAttribute('data-series', 'score');
  await expect(bars.first()).toHaveAttribute('data-series', 'maximum');

  await bars.last().hover();
  const tip = page.locator('.chart3d-tip');
  await expect(tip).toContainText('Mínimo: 30');
  await expect(tip).toContainText('Máximo: 70');
  await expect(tip).toContainText('Examen:');

  const shape = (): Promise<string | null> => bars.first().locator('polygon').first().getAttribute('points');
  const start_ = await shape();
  await chart.locator('svg').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(shape).not.toBe(start_);

  const box = await chart.locator('svg').boundingBox();
  const [x, y] = [(box?.x ?? 0) + 40, (box?.y ?? 0) + 40];
  const beforeDrag = await shape();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 30);
  await page.mouse.up();
  await expect.poll(shape).not.toBe(beforeDrag);

  await page.getByRole('button', { name: 'Restablecer vista' }).click();
  await expect.poll(shape).toBe(start_);

  await page.getByLabel('Comparar con el perfil').selectOption({ label: 'Sin perfil' });
  await expect(bars).toHaveCount(18);
  await expect(chart.locator('.chart3d-legend')).toHaveCount(0);
});

test('a screen that fails shows the error instead of a blank page', async ({ page }) => {
  await start(page);
  await page.route('**/ScoreChart-*.js', (route) => route.abort());
  await colorAndCi(page);
  // The report still shows when only its printed chart fails.
  await expect(page.locator('.report-trait').first()).toBeVisible();
  await expect(page.getByText('No se pudo cargar la gráfica.')).toBeAttached();
  await page.getByRole('link', { name: 'Gráfica' }).click();
  await expect(page.getByRole('heading', { name: 'No se pudo mostrar esta pantalla' })).toBeVisible();
  await expect(page.locator('code')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible();
});

test('the history lists sessions, searches and filters by module', async ({ page }) => {
  await start(page);
  await colorAndCi(page);
  await page.getByRole('link', { name: 'PsIV' }).click();
  await newSession(page, 'C.E.', 'Luis', 'Pérez');
  await fillSeries(page);
  for (let n = 1; n <= 30; n++) await page.getByRole('group', { name: `Pregunta ${String(n)}`, exact: true }).getByRole('radio', { name: 'B' }).check();
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: 'INFORME', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Historial' }).click();
  const rows = page.locator('.history tbody tr');
  await expect(rows).toHaveCount(2);
  await page.getByLabel('Buscar por nombre').fill('nunez');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Colores y C.I.');
  await page.getByLabel('Buscar por nombre').fill('');
  await page.getByLabel('Módulo').selectOption({ label: 'PsicoEmocional' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Luis Pérez');
  await rows.first().getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'INFORME', exact: true })).toBeVisible();
});

for (const format of ['Letter', 'A4'] as const) {
  test(`printing on ${format}: report, protocol and chart`, async ({ page }) => {
    await start(page);
    await colorAndCi(page);

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('.result-nav')).toBeHidden();
    await expect(page.locator('.sheet-header').first()).toBeVisible();
    const report = await page.pdf({ format, printBackground: true });
    expect(report.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(report)).toBeGreaterThan(1);
    await page.emulateMedia({ media: 'screen' });

    await page.getByRole('link', { name: 'Protocolo' }).click();
    await expect(page.locator('.protocol')).toBeVisible();
    expect(pageCount(await page.pdf({ format, printBackground: true }))).toBe(1);

    await page.getByRole('link', { name: 'Gráfica' }).click();
    await expect(page.locator('.chart-print .recharts-bar')).toHaveCount(3);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.chart-compare')).toBeHidden();
    await expect(page.locator('.chart-print')).toBeVisible();
    await expect(page.locator('.chart-screen')).toBeHidden();
    expect(pageCount(await page.pdf({ format, landscape: true, printBackground: true }))).toBe(1);
  });
}

test('the printed report ends with the protocol and the chart, unless turned off', async ({ page }) => {
  await start(page);
  await colorAndCi(page);
  const extras = page.locator('.sheet-appended');
  await expect(extras).toHaveCount(2);
  await expect(extras.first()).toBeHidden();
  await expect(page.locator('.sheet-appended .chart-screen')).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  await expect(extras.nth(0)).toBeVisible();
  await expect(extras.nth(0).locator('.protocol')).toBeVisible();
  await expect(extras.nth(0).locator('.sheet-header')).toBeVisible();
  await expect(extras.nth(1).locator('.chart-print .recharts-bar')).toHaveCount(3);
  await expect(extras.nth(1).locator('.chart-print')).toBeVisible();
  const withExtras = pageCount(await page.pdf({ format: 'A4', printBackground: true }));
  await page.emulateMedia({ media: 'screen' });

  await page.getByLabel('Imprimir también el protocolo y la gráfica').uncheck();
  await expect(extras).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  expect(pageCount(await page.pdf({ format: 'A4', printBackground: true }))).toBe(withExtras - 2);
});

test('the infographic summarizes the P4 report and prints a follow-up plan', async ({ page }) => {
  await start(page);
  await colorAndCi(page);
  await page.getByRole('link', { name: 'Infografía' }).click();
  await expect(page.getByRole('heading', { name: 'Ana Núñez' })).toBeVisible();
  await expect(page.locator('.ig-pill')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Perfil intelectual/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Rasgos laborales' }).getByRole('listitem')).toHaveCount(9);
  await expect(page.getByRole('list', { name: 'Inteligencia emocional' }).getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: /Plan de seguimiento/ })).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  if (process.env.INFOGRAPHIC_PDF) (await import('node:fs')).writeFileSync(process.env.INFOGRAPHIC_PDF, pdf);
  expect(pageCount(pdf)).toBeGreaterThanOrEqual(2);
});

test('the infographic is not offered for a C.E. session', async ({ page }) => {
  await start(page);
  await ceSession(page);
  await expect(page.getByRole('link', { name: 'Infografía' })).toHaveCount(0);
});
