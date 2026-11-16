#!/usr/bin/env node
// Builds the private oracle from stored legacy rows (DATA_MODEL.md, "Legacy oracle").
// Reads ~/psiv-private/export and export-restricted, and writes ~/psiv-private/oracle.
// It keeps only inputs and outputs, with no names, dates or IDs, and prints counts only.
// The oracle holds real people's results, and norms, so it must never be committed.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PRIVATE = join(homedir(), 'psiv-private');
const RESTRICTED = join(PRIVATE, 'export-restricted');
const CONTENT = join(PRIVATE, 'export');
const ORACLE = join(PRIVATE, 'oracle');

const rowsOf = (path) => JSON.parse(readFileSync(path, 'utf8')).rows;
const restricted = (table) => [...rowsOf(join(RESTRICTED, `${table}.json`)), ...rowsOf(join(RESTRICTED, 'deleted', `${table}.json`))];
const content = (table) => rowsOf(join(CONTENT, `${table}.json`));
const corrected = (table) => rowsOf(join(CONTENT, 'corrected', `${table}.json`));
const isSerie = (s) => /^[0-7]{8}$/.test(s ?? '') && new Set(s).size === 8;

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const k = row[key];
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }
  return groups;
}

function write(name, data) {
  const path = join(ORACLE, name);
  writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** One case per distinct input. Inputs with different outputs go to `conflicts`. */
function dedupe(items, inputKey) {
  const byInput = new Map();
  for (const item of items) {
    const key = inputKey(item);
    const outputs = byInput.get(key) ?? new Map();
    outputs.set(JSON.stringify(item), item);
    byInput.set(key, outputs);
  }
  const cases = [];
  const conflicts = [];
  for (const outputs of byInput.values()) {
    if (outputs.size === 1) cases.push(...outputs.values());
    else conflicts.push([...outputs.values()]);
  }
  return { cases, conflicts };
}

mkdirSync(ORACLE, { recursive: true, mode: 0o700 });
const colorRows = restricted('prststc');
const finished = colorRows.filter((r) => isSerie(r.SERIE1) && isSerie(r.SERIE2) && !r.S1_SGN?.includes('?') && !r.S2_SGN?.includes('?'));

// The newest rows were written by the build that matches the current source. Older rows differ in
// patterns that point to earlier builds, so they're kept apart (DATA_MODEL.md, Phase 3).
const RECENT_SHARE = 0.1;
const byAge = [...finished].sort((a, b) => a.ID_PRSTSTC - b.ID_PRSTSTC);
const recentRows = new Set(byAge.slice(Math.floor(byAge.length * (1 - RECENT_SHARE))));

/** `dedupe` within each cohort, because an input can have different outputs across builds. */
function dedupeByCohort(items, inputKey) {
  const parts = [true, false].map((recent) => dedupe(items.filter((i) => i.recent === recent), inputKey));
  return { cases: parts.flatMap((p) => p.cases), conflicts: parts.flatMap((p) => p.conflicts) };
}

// --- Color protocol ---
{
  const items = finished.map((r) => ({
    serie1: r.SERIE1,
    serie2: r.SERIE2,
    expected: {
      serie1: { signs: r.S1_SGN, marks: r.S1_ADM, letters: r.S1_AC },
      serie2: { signs: r.S2_SGN, marks: r.S2_ADM, letters: r.S2_AC },
    },
  }));
  const { cases, conflicts } = dedupe(items, (i) => `${i.serie1}|${i.serie2}`);
  write('color.json', cases);
  write('color-conflicts.json', conflicts);
  console.log(`color: rows ${colorRows.length}, unfinished ${colorRows.length - finished.length}, usable pairs ${cases.length}, conflicting ${conflicts.length}`);
}

// --- Qualitative base codes ---
{
  const codeById = new Map(content('txt').map((t) => [t.ID_TEXTO, t.TIPO]));
  const base = (code) => /^([A-Z]{2}\d{2})[A-Z]?$/.exec(code ?? '')?.[1] ?? null;
  const slotField = (n) => `CUALIF_TIPO_${String(n).padStart(2, '0')}`;
  let shifted = 0;
  let noText = 0;
  let unresolved = 0;
  const items = [];
  for (const r of finished) {
    if (!(r[slotField(1)] > 0)) {
      noText++;
      continue;
    }
    if (r[slotField(43)] > 0) {
      shifted++;
      continue;
    }
    const slots = {};
    for (let n = 1; n <= 42; n++) {
      const id = r[slotField(n)];
      if (id === null || id === undefined || id <= 0) slots[n] = null;
      else if (codeById.has(id)) slots[n] = base(codeById.get(id));
      else {
        slots[n] = '?';
        unresolved++;
      }
    }
    items.push({ serie1: r.SERIE1, serie2: r.SERIE2, recent: recentRows.has(r), slots });
  }
  const { cases, conflicts } = dedupeByCohort(items, (i) => `${i.serie1}|${i.serie2}`);
  write('qualitative.json', cases);
  write('qualitative-conflicts.json', conflicts);
  const xl = corrected('xl');
  write('conclusions.json', { defaultCode: '', exceptions: Object.fromEntries(xl.map((r) => [r.SERIE, r.TIPOTEXTO])) });
  console.log(`qualitative: rows with texts ${items.length}, without ${noText}, shifted rows left out ${shifted}, unresolved choices ${unresolved}, usable pairs ${cases.length}, conflicting ${conflicts.length}`);
}

// --- Trait scores and answers ---
const traitOf = (rows, prefix) => new Map(rows.map((r) => [r.ID_PSCGRDT, `${prefix}:${r.ID_RASGO}`]));
// The raw export, because stored scores also point at the rows that the corrected export removes.
const p4Rows = traitOf(content('pscgrdt'), 'p4');
const ceRows = traitOf(content('pscgrdtW'), 'ce');
const scoresByTest = groupBy(restricted('prsclf'), 'ID_PRSTST');
const answersByTest = groupBy(restricted('prststx'), 'ID_PRSTST');
const colorByTest = groupBy(finished, 'ID_PRSTST');
const agesByTest = groupBy(restricted('prstst').filter((t) => t.EDAD !== null), 'ID_PRSTST');
const CI_TRAITS = new Set(['p4:28', 'p4:29', 'p4:30', 'p4:31']);

/** Maps a group of stored scores to traits, or returns null if any row can't be resolved. */
function resolve(rows, table) {
  const out = {};
  for (const r of rows) {
    const trait = table.get(r.ID_PSCGRDT);
    if (!trait || trait in out) return null;
    out[trait] = r.CALIFICACION;
  }
  return out;
}

const ciItems = new Map(content('tstxdt').filter((r) => r.ID_TESTX === 4).map((r) => [r.ID_TSTXDT, r.PUNTOS_GRUPO]));
const ceItems = new Map(content('tstxdtW').filter((r) => r.ID_TESTX === 4).map((r) => [r.ID_TSTXDT, r.PUNTOS_GRUPO]));

function rawFactors(answers, items, codes) {
  const totals = Object.fromEntries(codes.map((c) => [c, 0]));
  for (const a of answers) {
    const code = items.get(a.ID_TSTXDT);
    if (!(code in totals)) return null;
    totals[code] += a.PUNTOS ?? 0;
  }
  return codes.map((c) => totals[c]);
}

const p4 = [];
const ce = [];
const ci = [];
const skipped = { p4: 0, ce: 0, ci: 0, sizes: 0 };
for (const [test, rows] of scoresByTest) {
  const color = colorByTest.get(test) ?? [];
  const answers = answersByTest.get(test) ?? [];
  const singleColor = color.length === 1 ? color[0] : null;

  if (rows.length === 14 || rows.length === 18) {
    const all = resolve(rows, p4Rows);
    if (!all || Object.keys(all).length !== rows.length) skipped.p4++;
    else {
      const colorScores = Object.fromEntries(Object.entries(all).filter(([t]) => !CI_TRAITS.has(t)));
      if (Object.keys(colorScores).length !== 14 || !singleColor) skipped.p4++;
      else p4.push({ serie1: singleColor.SERIE1, serie2: singleColor.SERIE2, recent: recentRows.has(singleColor), expected: colorScores });
    }
  }
  if (rows.length === 15) {
    const all = resolve(rows, ceRows);
    const raw = answers.length === 30 ? rawFactors(answers, ceItems, ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6']) : null;
    if (!all || !singleColor || !raw) skipped.ce++;
    else ce.push({ serie1: singleColor.SERIE1, serie2: singleColor.SERIE2, raw, expected: all });
  }
  if (rows.length === 4 || rows.length === 18) {
    const all = resolve(rows, p4Rows);
    const ciScores = all && Object.fromEntries(Object.entries(all).filter(([t]) => CI_TRAITS.has(t)));
    const raw = answers.length === 36 ? rawFactors(answers, ciItems, ['0.2', '0.3', '0.4']) : null;
    if (!ciScores || Object.keys(ciScores).length !== 4 || !raw) skipped.ci++;
    else {
      const ages = agesByTest.get(test) ?? [];
      ci.push({
        raw: { verbal: raw[0], numeric: raw[1], spatial: raw[2] },
        age: ages.length === 1 ? ages[0].EDAD : null,
        expected: ciScores,
      });
    }
  }
  if (![4, 14, 15, 18].includes(rows.length)) skipped.sizes++;
}

const inputOf = (i) => JSON.stringify([i.serie1, i.serie2, i.raw, i.age]);
for (const [name, items] of [['p4', p4], ['ce', ce], ['ci', ci]]) {
  const { cases, conflicts } = name === 'p4' ? dedupeByCohort(items, inputOf) : dedupe(items, inputOf);
  write(`${name}.json`, cases);
  write(`${name}-conflicts.json`, conflicts);
  console.log(`${name}: groups ${items.length}, left out ${skipped[name]}, distinct inputs ${cases.length}, conflicting ${conflicts.length}`);
}
console.log(`score groups of unexpected size: ${skipped.sizes}`);

// --- CI norms ---
{
  const bands = [
    { id: '18-30', grupo: 1830, minAge: 18, maxAge: 30 },
    { id: '31-45', grupo: 3145, minAge: 31, maxAge: 45 },
    { id: '46-150', grupo: 4699, minAge: 46, maxAge: 150 },
  ];
  const items = content('tstxdt').filter((r) => r.ID_TESTX === 8);
  const answers = content('tstxdtr');
  const table = {};
  for (const band of bands) {
    const item = items.find((r) => r.GRUPO === band.grupo);
    const rows = answers.filter((a) => a.ID_TSTXDT === item?.ID_TSTXDT);
    table[band.id] = [];
    for (const row of rows) table[band.id][Number(row.OPCION ?? row.RESPUESTA)] = row.PUNTOS;
  }
  write('ci-norms.json', { bands: bands.map(({ id, minAge, maxAge }) => ({ id, minAge, maxAge })), table });
  console.log(`ci norms: ${bands.map((b) => `${b.id} has ${table[b.id].filter((v) => v !== undefined).length} rows`).join(', ')}`);
}
