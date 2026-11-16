// Phase 8: job profiles and manuals. The acceptance test is that a custom profile changes the chart
// ranges. It uses only the synthetic demo pack, and rows are read with the raw browser API.
import { type Page, expect, test } from '@playwright/test';

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Probar con contenido de demostración' }).click();
  await expect(page.getByRole('heading', { name: 'Examinados' })).toBeVisible();
}

async function openProfiles(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Perfiles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Perfiles de puesto' })).toBeVisible();
}

async function createProfile(page: Page, company: string, position: string, source = 'Puesto de demostración'): Promise<void> {
  await page.getByLabel('Perfil de origen').selectOption({ label: source });
  await page.getByLabel('Empresa (opcional)').fill(company);
  await page.getByLabel('Puesto', { exact: true }).fill(position);
  await page.getByRole('button', { name: 'Crear a partir del origen' }).click();
  await expect(page.getByRole('form', { name: 'Editar perfil' })).toBeVisible();
}

test('the header goes back to the examinee list from another section', async ({ page }) => {
  await start(page);
  await openProfiles(page);
  await expect(page.getByRole('heading', { name: 'Examinados' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Examinados', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Examinados' })).toBeVisible();
});

const TRAIT = 'Rasgo de demostración p4:16';

async function setRange(page: Page, min: string, max: string): Promise<void> {
  await page.getByLabel(`Mínimo de ${TRAIT}`).fill(min);
  await page.getByLabel(`Máximo de ${TRAIT}`).fill(max);
}

async function colorSession(page: Page, profile: string): Promise<void> {
  await page.getByRole('link', { name: 'PsIV' }).click();
  if (!(await page.getByLabel('Nombre', { exact: true }).isVisible())) await page.getByText('Agregar examinado').first().click();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellido paterno').fill('Núñez');
  await page.getByLabel('Fecha de nacimiento').fill('1990-06-15');
  await page.getByRole('button', { name: 'Agregar examinado' }).click();
  await page.getByRole('link', { name: 'Ana Núñez' }).click();
  await page.getByRole('link', { name: 'Nueva sesión' }).click();
  await page.getByLabel('Fecha de la prueba').fill('2020-06-15');
  await page.getByLabel('Perfil del puesto').selectOption({ label: profile });
  await page.getByRole('button', { name: 'Empezar captura' }).click();
  await page.getByLabel('Serie 1').fill('01234567');
  await page.getByLabel('Serie 2').fill('32165470');
  await page.getByRole('button', { name: 'Guardar y terminar' }).click();
  await expect(page.getByRole('heading', { name: 'INFORME PSICOLABORAL' })).toBeVisible();
}

async function chartRow(page: Page): Promise<string> {
  await page.getByText('Ver datos en tabla').click();
  return (await page.getByRole('row', { name: new RegExp(TRAIT) }).innerText()).replace(/\s+/g, ' ');
}

test('a custom profile changes the chart ranges', async ({ page }) => {
  await start(page);
  await openProfiles(page);
  await createProfile(page, 'Acme', 'Auxiliar');
  await setRange(page, '11', '22');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByText('Perfil guardado.')).toBeVisible();

  await colorSession(page, 'Acme/Auxiliar');
  await expect(page.getByText('Puesto: Auxiliar').first()).toBeVisible();
  await page.getByRole('link', { name: 'Gráfica' }).click();
  await expect(page.locator('.chart-screen .recharts-bar')).toHaveCount(3);
  await expect(page.locator('.chart-profile-name')).toHaveText('Auxiliar');
  expect(await chartRow(page)).toContain('11 22 85');

  // The factory profile's ranges are different, as the comparison shows.
  await page.getByLabel('Comparar con el perfil').selectOption({ label: 'Puesto de demostración' });
  await expect(page.getByRole('row', { name: new RegExp(TRAIT) })).toContainText('30');
  expect((await page.getByRole('row', { name: new RegExp(TRAIT) }).innerText()).replace(/\s+/g, ' ')).toContain('30 70 85');
});

test('a saved session is not changed by later edits or by deleting the profile', async ({ page }) => {
  await start(page);
  await openProfiles(page);
  await createProfile(page, 'Acme', 'Auxiliar');
  await setRange(page, '11', '22');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByText('Perfil guardado.')).toBeVisible();
  await colorSession(page, 'Acme/Auxiliar');
  const report = page.url();

  await openProfiles(page);
  await page.getByRole('link', { name: 'Acme/Auxiliar' }).click();
  await setRange(page, '1', '2');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByText('Perfil guardado.')).toBeVisible();

  await page.goto(`${report.split('#')[0] ?? ''}#${report.split('#')[1] ?? ''}/grafica`);
  await expect(page.locator('.chart-screen .recharts-bar')).toHaveCount(3);
  expect(await chartRow(page)).toContain('11 22 85');

  await openProfiles(page);
  await page.getByRole('button', { name: 'Eliminar el perfil Acme/Auxiliar' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('no cambian');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('link', { name: 'Acme/Auxiliar' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar el perfil Acme/Auxiliar' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();
  await expect(page.getByRole('link', { name: 'Acme/Auxiliar' })).toHaveCount(0);

  await page.goto(`${report.split('#')[0] ?? ''}#${report.split('#')[1] ?? ''}/grafica`);
  await expect(page.locator('.chart-screen .recharts-bar')).toHaveCount(3);
  expect(await chartRow(page)).toContain('11 22 85');
});

test('factory profiles are read-only', async ({ page }) => {
  await start(page);
  await openProfiles(page);
  await page.getByRole('link', { name: 'Puesto de demostración' }).click();
  await expect(page.getByText('Los perfiles de fábrica son de solo consulta')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar perfil' })).toHaveCount(0);
  await expect(page.getByRole('row', { name: new RegExp(`${TRAIT} 30 70`) })).toBeVisible();
});

test('a profile with no ranges says so', async ({ page }) => {
  await start(page);
  await openProfiles(page);
  await page.getByRole('link', { name: 'Sin perfil' }).click();
  await expect(page.getByText('Este perfil no define rangos.')).toBeVisible();
});

test('the editor validates ranges and names', async ({ page }) => {
  await start(page);
  await openProfiles(page);

  await page.getByRole('button', { name: 'Crear a partir del origen' }).click();
  await expect(page.getByRole('alert')).toContainText('nombre del puesto');
  await createProfile(page, '', 'Auxiliar');

  await setRange(page, '80', '70');
  await expect(page.getByRole('alert')).toContainText('mínimo no puede ser mayor');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByText('Corrige los valores marcados')).toBeVisible();

  await setRange(page, '30', '101');
  await expect(page.getByRole('alert').first()).toContainText('máximo permitido es 100');
  await setRange(page, 'x', '70');
  await expect(page.getByRole('alert').first()).toContainText('números enteros');

  // CI traits go up to 150, and equal values are allowed.
  await setRange(page, '60', '60');
  await page.getByLabel('Máximo de Rasgo de demostración p4:28').fill('150');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByText('Perfil guardado.')).toBeVisible();

  await openProfiles(page);
  await page.getByLabel('Puesto', { exact: true }).fill('auxiliar');
  await page.getByRole('button', { name: 'Crear a partir del origen' }).click();
  await expect(page.getByRole('alert')).toContainText('Ya existe un perfil');
});

test('a profile can be copied from another custom one, with its values', async ({ page }) => {
  await start(page);
  await openProfiles(page);
  await createProfile(page, 'Acme', 'Auxiliar');
  await setRange(page, '11', '22');
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await expect(page.getByText('Perfil guardado.')).toBeVisible();

  await openProfiles(page);
  await createProfile(page, 'Acme', 'Gerente', 'Acme/Auxiliar');
  await expect(page.getByLabel(`Mínimo de ${TRAIT}`)).toHaveValue('11');
  await expect(page.getByLabel(`Máximo de ${TRAIT}`)).toHaveValue('22');
});

test('manuals open on demand and show their text', async ({ page }) => {
  await start(page);
  await page.getByRole('link', { name: 'Manuales' }).click();
  await page.getByRole('button', { name: 'Abrir manuales de demostración' }).click();
  await page.getByRole('link', { name: 'Manual de demostración' }).click();
  await expect(page.getByRole('heading', { name: 'Manual de demostración' })).toBeVisible();
  await expect(page.locator('.manual .report-text')).toContainText('Manual de demostración.');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(page.locator('.manual')).toBeVisible();
});
