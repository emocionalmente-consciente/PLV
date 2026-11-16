#!/usr/bin/env node
// Checks the recovered examinee rows. Prints counts and year ranges only, never row values.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = join(homedir(), 'psiv-private', 'export-restricted');
const live = (t) => JSON.parse(readFileSync(join(OUT, `${t}.json`), 'utf8')).rows;
const del = (t) => JSON.parse(readFileSync(join(OUT, 'deleted', `${t}.json`), 'utf8')).rows;
const all = (t) => [...live(t), ...del(t)];

console.log('--- recovered rows and ID overlap ---');
for (const [t, id] of [['prs', 'ID_PERSONA'], ['prstst', 'ID_PRSTST'], ['prststc', 'ID_PRSTSTC'], ['prststx', 'ID_PRSTSTX'], ['prsclf', 'ID_PRSCLF']]) {
  const d = del(t);
  const ids = new Set(all(t).map((r) => r[id]));
  const zero = d.filter((r) => !r[id]).length;
  console.log(`${t}: live ${live(t).length}, recovered ${d.length}, distinct ids ${ids.size} of ${live(t).length + d.length}, recovered with no id ${zero}`);
}

console.log('\n--- person fields (filled / total) ---');
const persons = del('prs');
for (const f of ['NOMBRE', 'AP_PATERNO', 'AP_MATERNO', 'SEXO', 'FECHA_NACIM']) {
  console.log(`${f}: ${persons.filter((r) => r[f]).length}/${persons.length}`);
}
const printable = (s) => /^[\p{L}\p{M} .'´`-]*$/u.test(s);
const oddNames = persons.filter((r) => ![r.NOMBRE, r.AP_PATERNO, r.AP_MATERNO].every((v) => !v || printable(v))).length;
console.log(`rows with unusual name characters: ${oddNames}`);
const years = (rows, f) => {
  const y = rows.map((r) => r[f]).filter(Boolean).map((v) => Number(v.slice(0, 4))).sort((a, b) => a - b);
  return `${y.length} dates, ${y[0]}-${y[y.length - 1]}`;
};
console.log(`birth dates: ${years(persons, 'FECHA_NACIM')}`);
console.log(`test dates: ${years(del('prstst'), 'FECHA_TEST')}`);

console.log('\n--- references, recovered rows to any row ---');
const refs = (child, key, parent, parentKey = key) => {
  const p = new Set(all(parent).map((r) => r[parentKey]));
  const c = del(child);
  console.log(`${child}.${key} -> ${parent}: ${c.filter((r) => p.has(r[key])).length}/${c.length}`);
};
refs('prstst', 'ID_PERSONA', 'prs');
refs('prststc', 'ID_PRSTST', 'prstst');
refs('prststx', 'ID_PRSTST', 'prstst');
refs('prsclf', 'ID_PRSTST', 'prstst');

const ages = del('prstst').map((r) => r.EDAD).filter((v) => v !== null);
const plausible = ages.filter((a) => a >= 10 && a <= 100).length;
console.log(`\nages recorded on tests: ${plausible}/${ages.length} between 10 and 100`);
const tests = new Set(all('prstst').map((r) => r.ID_PERSONA));
console.log(`recovered persons with at least one test: ${persons.filter((r) => tests.has(r.ID_PERSONA)).length}/${persons.length}`);

console.log('\n--- identity and link reliability ---');
const everyone = all('prs');
const identity = (r) => [r.NOMBRE, r.AP_PATERNO, r.AP_MATERNO, r.FECHA_NACIM].map((v) => String(v ?? '').trim().toUpperCase()).join('|');
const nameOnly = (r) => [r.NOMBRE, r.AP_PATERNO, r.AP_MATERNO].map((v) => String(v ?? '').trim().toUpperCase()).join('|');
console.log(`person rows ${everyone.length}; distinct name+birth date ${new Set(everyone.map(identity)).size}; distinct names ${new Set(everyone.map(nameOnly)).size}`);
const byId = new Map();
for (const r of everyone) {
  if (!byId.has(r.ID_PERSONA)) byId.set(r.ID_PERSONA, new Set());
  byId.get(r.ID_PERSONA).add(identity(r));
}
const ambiguousIds = new Set([...byId].filter(([, v]) => v.size > 1).map(([k]) => k));
console.log(`person IDs used by more than one identity: ${ambiguousIds.size} of ${byId.size}`);
const allTests = all('prstst');
const clear = allTests.filter((t) => byId.has(t.ID_PERSONA) && !ambiguousIds.has(t.ID_PERSONA)).length;
const ambiguous = allTests.filter((t) => ambiguousIds.has(t.ID_PERSONA)).length;
console.log(`tests: ${clear} link to one identity, ${ambiguous} to an ambiguous ID, ${allTests.length - clear - ambiguous} to no person`);
const testIds = new Set(allTests.map((t) => t.ID_PRSTST));
for (const t of ['prststc', 'prststx', 'prsclf']) {
  const rows = all(t);
  const linked = rows.filter((r) => testIds.has(r.ID_PRSTST)).length;
  console.log(`${t}: ${linked}/${rows.length} rows link to a test row; distinct test IDs referenced ${new Set(rows.map((r) => r.ID_PRSTST)).size}`);
}
const implausible = persons.filter((r) => { const y = Number(String(r.FECHA_NACIM).slice(0, 4)); return y < 1900 || y > 2007; }).length;
console.log(`recovered persons with birth year outside 1900-2007: ${implausible}`);
const digits = persons.filter((r) => /\d/.test(`${r.NOMBRE}${r.AP_PATERNO}${r.AP_MATERNO}`)).length;
console.log(`recovered persons with digits in the name: ${digits}`);
