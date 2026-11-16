#!/usr/bin/env node
// Applies the agreed content decisions to the raw export (DATA_EXTRACTION.md, "Content decisions").
// The raw export stays untouched; results go to ~/psiv-private/export/corrected.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = join(homedir(), 'psiv-private', 'export');
const FIXED = join(OUT, 'corrected');
const REPO = process.env.PSIV_LEGACY_DIR ?? join(homedir(), 'Desktop', 'PsIV');
const read = (t) => JSON.parse(readFileSync(join(OUT, `${t}.json`), 'utf8'));
const write = (name, data) => writeFileSync(join(FIXED, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`);
mkdirSync(FIXED, { recursive: true });

// Decision 1: repair the one truncated xl ordering.
const xl = read('xl');
const bad = xl.rows.filter((r) => r.ID_CRITERI === 1 && r.SERIE === '7145623');
if (bad.length !== 1) throw new Error(`expected 1 truncated xl row, found ${bad.length}`);
bad[0].SERIE = '71456230';
write('xl', xl);
console.log('xl: ID_CRITERI 1 SERIE -> 71456230');

// Decision 6: ignore profile rows with no parent, and the texts attached to them.
const profiles = new Set(read('pscgr').rows.map((r) => r.ID_PSICOGRAFO));
for (const [dt, txt] of [['pscgrdt', 'pscgrtxt'], ['pscgrdtW', 'pscgrtxtW']]) {
  const d = read(dt);
  const t = read(txt);
  const before = [d.rows.length, t.rows.length];
  d.rows = d.rows.filter((r) => profiles.has(r.ID_PSICOGRAFO));
  const kept = new Set(d.rows.map((r) => r.ID_PSCGRDT));
  t.rows = t.rows.filter((r) => kept.has(r.ID_PSCGRDT));
  write(dt, d);
  write(txt, t);
  console.log(`${dt}: ${before[0]} -> ${d.rows.length}; ${txt}: ${before[1]} -> ${t.rows.length}`);
}

// Decision 2: the new app keys traits by ID. Map each name the engine uses to its ID,
// matching without accents so the PERCEPCION SALUD spelling difference cannot break it.
const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
const traits = [
  ...read('rgo').rows.map((r) => ({ table: 'rgo', id: r.ID_RASGO, name: r.DESC_RASGO })),
  ...read('rgow').rows.map((r) => ({ table: 'rgow', id: r.ID_RASGO, name: r.DESC_RASGO })),
];
const map = {};
const sources = readdirSync(REPO).filter((f) => f.endsWith('.pas'));
for (const f of sources) {
  const code = readFileSync(join(REPO, f)).toString('latin1');
  for (const m of code.matchAll(/GetRasgo\('([^']+)'/g)) {
    const hits = traits.filter((t) => plain(t.name) === plain(m[1]));
    if (hits.length !== 1) throw new Error(`${m[1]}: ${hits.length} matching traits`);
    map[m[1]] = { table: hits[0].table, id: hits[0].id, dbName: hits[0].name };
  }
}
write('trait-ids', map);
console.log(`trait-ids: ${Object.keys(map).length} engine names mapped`);
