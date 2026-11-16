#!/usr/bin/env node
// Referential and structural checks over ~/psiv-private/export (DATA_EXTRACTION.md step 6).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = join(homedir(), 'psiv-private', 'export');
const load = (t) => JSON.parse(readFileSync(join(OUT, `${t}.json`), 'utf8')).rows;

function refs(childName, key, parentName, parentKey = key) {
  const child = load(childName);
  const parent = new Set(load(parentName).map((r) => r[parentKey]));
  const orphans = child.filter((r) => r[key] !== null && !parent.has(r[key]));
  console.log(`${childName}.${key} -> ${parentName}: ${child.length} rows, ${orphans.length} orphans`);
}

function dupes(t, key) {
  const rows = load(t);
  const n = new Set(rows.map((r) => r[key])).size;
  console.log(`${t}.${key}: ${rows.length} rows, ${n} distinct`);
}

console.log('--- unique ids ---');
for (const [t, k] of [['rgo', 'ID_RASGO'], ['rgow', 'ID_RASGO'], ['txt', 'ID_TEXTO'], ['txtW', 'ID_TEXTO'], ['pscgrtxt', 'ID_PSCGRTXT'], ['pscgrtxtW', 'ID_PSCGRTXT'], ['pscgrdt', 'ID_PSCGRDT'], ['pscgrdtW', 'ID_PSCGRDT'], ['tstxdt', 'ID_TSTXDT'], ['tstxdtW', 'ID_TSTXDT'], ['tstxdtr', 'ID_TSTXDTR'], ['tstxdtrW', 'ID_TSTXDTR'], ['xl', 'ID_CRITERI']]) dupes(t, k);

console.log('\n--- references ---');
refs('pscgrtxt', 'ID_PSCGRDT', 'pscgrdt');
refs('pscgrtxt', 'ID_TEXTO', 'txt');
refs('pscgrtxtW', 'ID_PSCGRDT', 'pscgrdtW');
refs('pscgrtxtW', 'ID_TEXTO', 'txtW');
refs('pscgrdt', 'ID_RASGO', 'rgo');
refs('pscgrdtW', 'ID_RASGO', 'rgow');
refs('pscgrdt', 'ID_PSICOGRAFO', 'pscgr');
refs('pscgrdtW', 'ID_PSICOGRAFO', 'pscgr');
refs('pscgr', 'ID_EMPRESA', 'emp');
refs('pscgr', 'ID_PUESTO', 'pto');
refs('tstxdt', 'ID_TESTX', 'tstx');
refs('tstxdtW', 'ID_TESTX', 'tstxW');
refs('tstxdtr', 'ID_TSTXDT', 'tstxdt');
refs('tstxdtrW', 'ID_TSTXDT', 'tstxdtW');

console.log('\n--- xl ---');
const xl = load('xl');
const serie = new Set(xl.map((r) => r.SERIE));
const valid = [...serie].filter((s) => /^[0-7]{8}$/.test(s) && new Set(s).size === 8).length;
console.log(`rows ${xl.length}, distinct orderings ${serie.size}, valid permutations ${valid}, expected 40320`);

console.log('\n--- tests ---');
console.log('tstx', JSON.stringify(load('tstx')));
console.log('tstxW', JSON.stringify(load('tstxW')));
const byTest = (t) => {
  const m = new Map();
  for (const r of load(t)) m.set(r.ID_TESTX, (m.get(r.ID_TESTX) ?? 0) + 1);
  return JSON.stringify([...m]);
};
console.log('tstxdt rows per test', byTest('tstxdt'));
console.log('tstxdtW rows per test', byTest('tstxdtW'));
console.log('tstxdt sample', JSON.stringify(load('tstxdt').slice(0, 3)));
console.log('tstxdtr sample', JSON.stringify(load('tstxdtr').slice(0, 5)));
console.log('tstxdtrW sample', JSON.stringify(load('tstxdtrW').slice(0, 5)));

console.log('\n--- traits ---');
console.log('rgo', load('rgo').map((r) => r.DESC_RASGO).join(' | '));
console.log('rgow', load('rgow').map((r) => r.DESC_RASGO).join(' | '));
