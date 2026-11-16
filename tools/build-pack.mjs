#!/usr/bin/env -S npx tsx
// Builds the encrypted content packs from the private export (DATA_MODEL.md, "Content pack").
// Output goes outside the repo, to ~/psiv-private/packs. It prints counts and codes, never content.
//
//   npm run build:pack                 asks for a passphrase and writes the packs
//   npm run build:pack -- --check      runs every check, and writes nothing
//
// The passphrase comes from a hidden prompt, or from PSIV_PACK_PASSPHRASE.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { TRAITS_WITHOUT_TEXT, checkExamineePack, checkManualsPack, checkOperatorPack } from '../src/content/checks';
import { EXAMINEE_CONSENT, EXAMINEE_INSTRUCTIONS } from '../src/content/examinee-text';
import { DEFAULT_ITERATIONS } from '../src/content/crypto';
import { encryptPack } from '../src/content/crypto';
import { openExamineePack, openManualsPack, openOperatorPack } from '../src/content/loader';
import { examineePackSchema, manualsPackSchema, operatorPackSchema } from '../src/content/schemas';
import { CE_FACTOR_TRAITS } from '../src/domain/ce/score';
import { textIdsForScore } from '../src/domain/text/select';

const PRIVATE = join(homedir(), 'psiv-private');
const EXPORT = join(PRIVATE, 'export');
const CACHE = join(PRIVATE, 'png-cache');
const REPO = resolve(new URL('..', import.meta.url).pathname);
const CHECK_ONLY = process.argv.includes('--check');
const outArg = process.argv.indexOf('--out');
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(PRIVATE, 'packs'));
const MIN_PASSPHRASE = 12;

// Texts that the data decisions allow to stay empty (DATA_EXTRACTION.md, decision 5).
const ALLOWED_EMPTY = new Set(['p4:336', 'ce:115', 'ce:116', 'ce:117']);

const filesRead = [];
function readJson(...parts) {
  const path = join(EXPORT, ...parts);
  filesRead.push(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
const table = (name) => readJson(`${name}.json`).rows;
const corrected = (name) => readJson('corrected', `${name}.json`).rows;
const textRows = (name) => readJson('texts', `${name}.json`);

function fail(messages) {
  console.error(`Build stopped, ${messages.length} problem(s):`);
  for (const m of messages.slice(0, 40)) console.error(`  ${m}`);
  process.exit(1);
}

// --- Images ---
mkdirSync(CACHE, { recursive: true, mode: 0o700 });
function pngBase64(bmpName) {
  const source = join(EXPORT, 'images', bmpName);
  const target = join(CACHE, bmpName.replace(/\.bmp$/, '.png'));
  if (!existsSync(target)) execFileSync('sips', ['-s', 'format', 'png', source, '--out', target], { stdio: 'ignore' });
  return readFileSync(target).toString('base64');
}

/** Rewrites image references to PNG, adds the images to `assets`, and normalizes the HTML. */
function convertHtml(html, assets) {
  return html.replace(/<img src="images\/([\w.-]+)\.bmp"/g, (_, name) => {
    const asset = `images/${name}.png`;
    assets[asset] = pngBase64(`${name}.bmp`);
    return `<img src="${asset}"`;
  });
}

// --- Traits ---
const FIX_NAME = (name) => name.replaceAll('Ò', 'Ó');
const profileRowsP4 = corrected('pscgrdt');
const profileRowsCe = corrected('pscgrdtW');
const rgo = table('rgo');
const rgow = table('rgow');

function buildTraits(rows, profileRows, module) {
  const codeOf = new Map(profileRows.map((r) => [r.ID_RASGO, r.ORDEN]));
  return rows
    .filter((r) => codeOf.has(r.ID_RASGO))
    .map((r) => ({ id: `${module}:${r.ID_RASGO}`, module, name: FIX_NAME(r.DESC_RASGO), reportCode: codeOf.get(r.ID_RASGO), order: r.ORDEN }));
}
const traits = [...buildTraits(rgo, profileRowsP4, 'p4'), ...buildTraits(rgow, profileRowsCe, 'ce')];
const usedP4 = new Set(profileRowsP4.map((r) => r.ID_RASGO));
const reportSections = rgo.filter((r) => !usedP4.has(r.ID_RASGO)).map((r) => ({ id: `p4:${r.ID_RASGO}`, name: FIX_NAME(r.DESC_RASGO), order: r.ORDEN }));

// --- Text tables ---
function buildTables(textTable, rangeRows, module) {
  const rangeById = new Map(rangeRows.map((r) => [r.ID_PSCGRDT, r]));
  const byTraitProfile = new Map();
  for (const row of [...textTable].sort((a, b) => a.SEC_TEXTO - b.SEC_TEXTO)) {
    const range = rangeById.get(row.ID_PSCGRDT);
    if (!range) continue;
    const trait = `${module}:${range.ID_RASGO}`;
    // CI factors point at the `AAA` placeholder, but legacy always saves them with no text.
    if (TRAITS_WITHOUT_TEXT.has(trait)) continue;
    const profile = `factory:${range.ID_PSICOGRAFO}`;
    const perTrait = byTraitProfile.get(trait) ?? new Map();
    const bands = perTrait.get(profile) ?? [];
    let band = bands.find((b) => b.min === row.CALIF_MIN && b.max === row.CALIF_MAX);
    if (!band) {
      band = { min: row.CALIF_MIN, max: row.CALIF_MAX, textIds: [] };
      bands.push(band);
    }
    band.textIds.push(`${module}:${row.ID_TEXTO}`);
    perTrait.set(profile, bands);
    byTraitProfile.set(trait, perTrait);
  }
  const tables = [];
  let shared = 0;
  let varied = 0;
  for (const [traitId, perProfile] of byTraitProfile) {
    const variants = new Map();
    for (const [profile, bands] of perProfile) {
      const sorted = [...bands].sort((a, b) => a.min - b.min || a.max - b.max);
      const key = JSON.stringify(sorted);
      const entry = variants.get(key) ?? { bands: sorted, profiles: [] };
      entry.profiles.push(profile);
      variants.set(key, entry);
    }
    if (variants.size === 1) {
      shared++;
      tables.push({ traitId, profileIds: null, bands: [...variants.values()][0].bands });
    } else {
      varied++;
      console.log(`  ${traitId} varies: ${[...variants.values()].map((v) => `${v.profiles.length} profiles with ${v.bands.length} bands`).join('; ')}`);
      for (const { bands, profiles } of variants.values()) tables.push({ traitId, profileIds: profiles, bands });
    }
  }
  console.log(`${module} text tables: ${shared} traits share one table, ${varied} vary by profile`);
  return tables;
}
const traitTextTables = [...buildTables(corrected('pscgrtxt'), profileRowsP4, 'p4'), ...buildTables(corrected('pscgrtxtW'), profileRowsCe, 'ce')];
const referenced = new Set(traitTextTables.flatMap((t) => t.bands.flatMap((b) => b.textIds)));

// --- Texts ---
const coreAssets = {};
const manualAssets = {};
const manuals = [];
const conflicts = [];
const IS_MANUAL = /^X(MP|DP|GT|MU|PE|GU)$/;
const SPLIT_CODE = /^([A-Z]{2}\d{2})([A-Z])$/;

function buildTexts(name, module) {
  const texts = [];
  for (const row of textRows(name)) {
    const id = `${module}:${row.ID_TEXTO}`;
    if (IS_MANUAL.test(row.TIPO)) {
      manuals.push({ id: `manual:${module}:${row.ID_TEXTO}`, module, code: row.TIPO, title: row.COMENT ?? '', html: convertHtml(row.html, manualAssets) });
      continue;
    }
    // Legacy looks up `ZZZ` only as a marker, and `AAA` is a placeholder. Neither is report content.
    if (/^(ZZZ|AAA)$/.test(row.TIPO)) {
      if (referenced.has(id)) conflicts.push(`${id} is a placeholder, but a table refers to it`);
      continue;
    }
    const parts = SPLIT_CODE.exec(row.TIPO);
    texts.push({
      id,
      module,
      code: row.TIPO,
      baseCode: parts ? parts[1] : row.TIPO,
      variant: parts ? parts[2] : null,
      html: convertHtml(row.html, coreAssets),
      note: row.COMENT ?? null,
    });
  }
  return texts;
}
const texts = [...buildTexts('txt', 'p4'), ...buildTexts('txtW', 'ce')];
for (const row of textRows('txtm')) {
  manuals.push({ id: `manual:p4m:${row.ID_TEXTOM}`, module: 'p4', code: row.TIPOM, title: row.COMENTM ?? '', html: convertHtml(row.html, manualAssets) });
}

// --- Conclusions ---
const xl = corrected('xl');
const counts = new Map();
for (const row of xl) counts.set(row.TIPOTEXTO, (counts.get(row.TIPOTEXTO) ?? 0) + 1);
const defaultCode = [...counts].sort((a, b) => b[1] - a[1])[0][0];
const exceptions = Object.fromEntries(xl.filter((r) => r.TIPOTEXTO !== defaultCode).map((r) => [r.SERIE, r.TIPOTEXTO]));

// --- CI ---
const FACTORS = { 0.2: 'verbal', 0.3: 'numeric', 0.4: 'spatial' };
const tstxdt = table('tstxdt');
const tstxdtr = table('tstxdtr');
const ciRows = tstxdt.filter((r) => r.ID_TESTX === 4).sort((a, b) => a.ORDEN - b.ORDEN);
const ciItems = [];
const ciKey = [];
const examineeAssets = {};
for (const row of ciRows) {
  const number = row.ORDEN + 1;
  const id = `ci:${number}`;
  const imageAsset = `ci/ci-${String(number).padStart(2, '0')}.png`;
  const bmp = `ci-${String(row.ORDEN).padStart(2, '0')}-grp1.bmp`;
  coreAssets[imageAsset] = pngBase64(bmp);
  examineeAssets[imageAsset] = coreAssets[imageAsset];
  const factor = FACTORS[row.PUNTOS_GRUPO];
  // The images are the source for the options (DATA_MODEL.md, Phase 10).
  const options = number === 1 || number === 25 ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'c', 'd', 'e'];
  ciItems.push({ id, order: number, imageAsset, answer: factor === 'numeric' ? { kind: 'number' } : { kind: 'choice', options } });
  const correct = tstxdtr.filter((a) => a.ID_TSTXDT === row.ID_TSTXDT && a.PUNTOS > 0);
  if (correct.length !== 1) conflicts.push(`${id} has ${correct.length} correct answers`);
  ciKey.push({ itemId: id, answer: (correct[0]?.RESPUESTA ?? '').trim().toLowerCase(), factor });
}

const BANDS = [
  { id: '18-30', grupo: 1830, minAge: 18, maxAge: 30 },
  { id: '31-45', grupo: 3145, minAge: 31, maxAge: 45 },
  { id: '46-150', grupo: 4699, minAge: 46, maxAge: 150 },
];
const normTable = {};
for (const band of BANDS) {
  const row = tstxdt.find((r) => r.ID_TESTX === 8 && r.GRUPO === band.grupo);
  const values = [];
  for (const a of tstxdtr.filter((x) => x.ID_TSTXDT === row?.ID_TSTXDT)) values[a.OPCION] = a.PUNTOS;
  normTable[band.id] = Array.from({ length: values.length }, (_, i) => values[i] ?? Number.NaN);
}

// --- CE ---
const ceTexts = new Map(textRows('tstxdtW').map((t) => [t.ID_TSTXDT, t.plain]));
const tstxdtrW = table('tstxdtrW');
const ceRows = table('tstxdtW').filter((r) => r.ID_TESTX === 4).sort((a, b) => a.ORDEN - b.ORDEN);
const ceTraitByGroup = (group) => CE_FACTOR_TRAITS[Number(group.split('.')[1]) - 1];
const ceItems = [];
const ceScoring = [];
for (const row of ceRows) {
  const id = `ce:${row.ORDEN}`;
  const lines = (ceTexts.get(row.ID_TSTXDT) ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const options = [];
  for (const line of lines.slice(1)) {
    const m = /^([A-Ca-c])\)\s*(.+)$/.exec(line);
    if (m) options.push({ key: m[1].toUpperCase(), text: m[2].trim() });
    else conflicts.push(`${id} has an option line that doesn't parse`);
  }
  ceItems.push({ id, order: row.ORDEN, stem: (lines[0] ?? '').replace(/^\d+\s*[.)-]?\s*/, ''), options });
  const points = { A: 0, B: 0, C: 0 };
  for (const a of tstxdtrW.filter((x) => x.ID_TSTXDT === row.ID_TSTXDT)) points[a.RESPUESTA] = a.PUNTOS;
  const traitId = ceTraitByGroup(row.PUNTOS_GRUPO);
  const trait = rgow.find((t) => `ce:${t.ID_RASGO}` === traitId);
  if (FIX_NAME(trait?.DESC_RASGO ?? '') !== FIX_NAME(row.REFERENCIA)) conflicts.push(`${id} factor doesn't match its trait`);
  ceScoring.push({ itemId: id, traitId, points });
}

// --- Profiles ---
const pto = new Map(table('pto').map((r) => [r.ID_PUESTO, r.NOMBRE_PUESTO]));
const profiles = table('pscgr').map((row) => {
  const ranges = {};
  for (const r of profileRowsP4.filter((x) => x.ID_PSICOGRAFO === row.ID_PSICOGRAFO)) ranges[`p4:${r.ID_RASGO}`] = { min: r.MINIMO, max: r.MAXIMO };
  for (const r of profileRowsCe.filter((x) => x.ID_PSICOGRAFO === row.ID_PSICOGRAFO)) ranges[`ce:${r.ID_RASGO}`] = { min: r.MINIMO, max: r.MAXIMO };
  return {
    id: `factory:${row.ID_PSICOGRAFO}`,
    name: pto.get(row.ID_PUESTO) ?? '',
    locked: row.BLOQUEADO === true,
    hasRanges: row.TIPO !== 0,
    modules: [...(row.P4 === 'S' ? ['p4'] : []), ...(row.CE === 'S' ? ['ce'] : [])],
    ranges,
  };
});

// --- Norm profiles ---
// Figures and notes come from the book, so their source stays outside the repo (DATA_MODEL.md, Phase 9).
const NORMS = join(PRIVATE, 'norms', 'norm-profiles.json');
if (!existsSync(NORMS)) fail([`Missing ${NORMS}`]);
const normProfiles = JSON.parse(readFileSync(NORMS, 'utf8'));

// --- Assemble and check ---
const body = {
  traits,
  reportSections,
  texts,
  traitTextTables,
  conclusions: { defaultCode, exceptions },
  ci: { items: ciItems, key: ciKey, norms: { bands: BANDS.map(({ id, minAge, maxAge }) => ({ id, minAge, maxAge })), table: normTable } },
  ce: { items: ceItems, scoring: ceScoring },
  profiles,
  normProfiles,
};
const contentVersion = `${new Date().toISOString().slice(0, 10)}-${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 8)}`;
// The examinee pack has its own key, because every invitation link carries it. It stays the same
// between builds, so links already sent keep working with a rebuilt pack.
const KEY_FILE = join(PRIVATE, 'examinee-pack.key');
function examineePackKey() {
  if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, 'utf8').trim();
  const key = randomBytes(32).toString('base64url');
  if (!CHECK_ONLY) writeFileSync(KEY_FILE, key, { mode: 0o600 });
  return key;
}
const examineeKey = examineePackKey();
const operator = operatorPackSchema.parse({ kind: 'operator-core', schemaVersion: 1, contentVersion, ...body, examineePackKey: examineeKey, assets: coreAssets });
const manualsPack = manualsPackSchema.parse({ kind: 'operator-manuals', schemaVersion: 1, contentVersion, manuals, assets: manualAssets });
const examinee = examineePackSchema.parse({
  kind: 'examinee',
  schemaVersion: 1,
  contentVersion,
  ci: { items: ciItems },
  ce: { items: ceItems },
  instructions: EXAMINEE_INSTRUCTIONS,
  consent: EXAMINEE_CONSENT,
  assets: examineeAssets,
});

const problems = [...conflicts, ...checkOperatorPack(operator, ALLOWED_EMPTY), ...checkManualsPack(manualsPack), ...checkExamineePack(examinee, operator)];

// Every ordering must give the same conclusion as the source table.
const seen = new Set();
for (const row of xl) {
  seen.add(row.SERIE);
  if ((exceptions[row.SERIE] ?? defaultCode) !== row.TIPOTEXTO) problems.push('A conclusion differs from the source table');
}
if (seen.size !== 40320) problems.push(`Conclusions cover ${seen.size} orderings, expected 40320`);

// Each CI image must come from its own item's blob, or questions would show against the wrong key.
for (const row of ciRows) {
  const bmp = readFileSync(join(EXPORT, 'images', `ci-${String(row.ORDEN).padStart(2, '0')}-grp1.bmp`));
  const blob = readFileSync(join(EXPORT, row.BLOBTST.blob));
  if (!blob.includes(bmp)) problems.push(`ci:${row.ORDEN + 1} image doesn't come from its item's blob`);
}

// Grouping must lose nothing: for every profile, trait and score, the pack has to give the same texts as the source.
let tableComparisons = 0;
for (const [module, rangeRows, textTable] of [['p4', profileRowsP4, corrected('pscgrtxt')], ['ce', profileRowsCe, corrected('pscgrtxtW')]]) {
  for (const range of rangeRows) {
    const trait = `${module}:${range.ID_RASGO}`;
    if (TRAITS_WITHOUT_TEXT.has(trait)) continue;
    const profile = `factory:${range.ID_PSICOGRAFO}`;
    const source = textTable.filter((r) => r.ID_PSCGRDT === range.ID_PSCGRDT);
    const packed = operator.traitTextTables.filter((x) => x.traitId === trait && (x.profileIds === null || x.profileIds.includes(profile)));
    if (packed.length !== 1) problems.push(`${trait} has ${packed.length} tables for ${profile}`);
    for (let score = 0; score <= 140; score++) {
      const expected = source.filter((r) => score >= r.CALIF_MIN && score <= r.CALIF_MAX).map((r) => `${module}:${r.ID_TEXTO}`).sort();
      const actual = textIdsForScore(packed[0]?.bands ?? [], score).sort();
      tableComparisons++;
      if (expected.join() !== actual.join()) problems.push(`${trait} differs from the source for ${profile} at score ${score}`);
    }
  }
}
console.log(`text tables compared with the source at ${tableComparisons} points`);

// No file from export-restricted may have been read.
const restricted = filesRead.filter((f) => f.includes('export-restricted'));
if (restricted.length > 0) problems.push(`Read ${restricted.length} restricted files`);
if (problems.length > 0) fail(problems);

const size = (o) => `${(JSON.stringify(o).length / 1e6).toFixed(1)} MB`;
console.log(`checks passed: ${filesRead.length} files read, none restricted`);
console.log(`version ${contentVersion}`);
console.log(`core: ${traits.length} traits, ${reportSections.length} sections, ${texts.length} texts, ${traitTextTables.length} text tables, ${ciItems.length} CI items, ${ceItems.length} CE items, ${profiles.length} profiles, ${Object.keys(exceptions).length} conclusion exceptions, ${size(operator)}`);
console.log(`manuals: ${manuals.length} manuals, ${Object.keys(manualAssets).length} images, ${size(manualsPack)}`);
console.log(`examinee: ${size(examinee)}`);
if (CHECK_ONLY) process.exit(0);

// --- Encrypt and write ---
async function askPassphrase() {
  if (process.env.PSIV_PACK_PASSPHRASE) return process.env.PSIV_PACK_PASSPHRASE;
  if (!process.stdin.isTTY) fail(['Set PSIV_PACK_PASSPHRASE, or run this in a terminal.']);
  const ask = (prompt) =>
    new Promise((done) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      process.stdout.write(prompt);
      rl._writeToOutput = () => {};
      rl.question('', (answer) => {
        rl.close();
        process.stdout.write('\n');
        done(answer);
      });
    });
  const first = await ask('Frase de acceso: ');
  if (first !== (await ask('Repite la frase de acceso: '))) fail(['The passphrases are different.']);
  return first;
}

if (OUT === REPO || OUT.startsWith(REPO + sep)) fail(['Real packs must be written outside the repo.']);
const passphrase = await askPassphrase();
if (passphrase.length < MIN_PASSPHRASE) fail([`The passphrase needs at least ${MIN_PASSPHRASE} characters.`]);
mkdirSync(OUT, { recursive: true, mode: 0o700 });
const packs = [
  ['operator-core', operator, openOperatorPack, passphrase],
  ['operator-manuals', manualsPack, openManualsPack, passphrase],
  ['examinee', examinee, openExamineePack, examineeKey],
];
for (const [name, content, open, packPassphrase] of packs) {
  const file = await encryptPack(content, packPassphrase, DEFAULT_ITERATIONS);
  const path = join(OUT, `${name}.psivpack`);
  writeFileSync(path, file, { mode: 0o600 });
  chmodSync(path, 0o600);
  // Read it back, to prove that the file opens with this passphrase.
  const reopened = await open(new Uint8Array(readFileSync(path)), packPassphrase);
  if (JSON.stringify(reopened) !== JSON.stringify(content)) fail([`${name} doesn't match after reopening.`]);
  console.log(`${basename(path)}: ${(file.length / 1e6).toFixed(1)} MB, reopened and matched`);
}
console.log(`Packs are in ${OUT}. Keep a backup of the files and the passphrase: a lost passphrase can't be recovered.`);
