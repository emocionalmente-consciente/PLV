#!/usr/bin/env node
// Step 6 checklist: compares the export against sources independent of the database.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OUT = join(homedir(), 'psiv-private', 'export');
const REPO = process.env.PSIV_LEGACY_DIR ?? join(homedir(), 'Desktop', 'PsIV');
const rows = (t) => JSON.parse(readFileSync(join(OUT, `${t}.json`), 'utf8')).rows;
const texts = (t) => JSON.parse(readFileSync(join(OUT, 'texts', `${t}.json`), 'utf8'));
const docText = (file) => execFileSync('textutil', ['-convert', 'txt', '-stdout', join(REPO, file)], { maxBuffer: 1 << 26 }).toString('utf8');
const norm = (s) => s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const line = (ok, msg) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);

// Counts
const ci = rows('tstxdt').filter((r) => r.ID_TESTX === 4);
const ce = rows('tstxdtW').filter((r) => r.ID_TESTX === 4);
line(ci.length === 36, `CI items: ${ci.length}`);
line(ce.length === 30, `CE items: ${ce.length}`);

// CI key: one correct answer per item
const ciIds = new Set(ci.map((r) => r.ID_TSTXDT));
const ciAns = rows('tstxdtr').filter((r) => ciIds.has(r.ID_TSTXDT));
const perItem = new Map();
for (const a of ciAns) perItem.set(a.ID_TSTXDT, [...(perItem.get(a.ID_TSTXDT) ?? []), a]);
line(perItem.size === 36, `CI items with an answer: ${perItem.size}; answer rows ${ciAns.length}`);
console.log('      CI key:', ci.sort((a, b) => a.ORDEN - b.ORDEN).map((r, i) => `${i + 1}=${(perItem.get(r.ID_TSTXDT) ?? []).map((a) => a.RESPUESTA).join('/')}`).join(' '));
const factors = new Map();
for (const r of ci) factors.set(`${r.REFERENCIA} ${r.PUNTOS_GRUPO}`, (factors.get(`${r.REFERENCIA} ${r.PUNTOS_GRUPO}`) ?? 0) + 1);
console.log('      CI factors:', JSON.stringify([...factors]));

// CE points
const ceIds = new Set(ce.map((r) => r.ID_TSTXDT));
const ceAns = rows('tstxdtrW').filter((r) => ceIds.has(r.ID_TSTXDT));
const cePer = new Map();
for (const a of ceAns) cePer.set(a.ID_TSTXDT, (cePer.get(a.ID_TSTXDT) ?? 0) + 1);
line([...cePer.values()].every((v) => v === 3) && cePer.size === 30, `CE: ${cePer.size} items with 3 scored options each (${ceAns.length} rows)`);
const ceFactors = new Map();
for (const r of ce) ceFactors.set(r.REFERENCIA, (ceFactors.get(r.REFERENCIA) ?? 0) + 1);
console.log('      CE factor mapping:', JSON.stringify([...ceFactors]));

// CE item wording vs document
const ceDoc = norm(docText('docs/Test Autodescriptivo.doc'));
const ceTexts = texts('tstxdtW');
// The document lays out options differently, so compare the stem and each option separately.
const cePieces = ceTexts.flatMap((t) => t.plain.split(/\b[A-Ca-c]\)/).map((s, i) => ({ id: t.ID_TSTXDT, i, n: i === 0 ? norm(s).replace(/^\d+ /, '') : norm(s) })));
const ceMissing = cePieces.filter((p) => p.n && !ceDoc.includes(p.n));
// Decision 4: the program's wording wins, so differences from the document are informational.
console.log(`NOTE  CE wording: ${cePieces.length - ceMissing.length}/${cePieces.length} stems and options match the document; the program's wording is kept`);

// Norms vs document
const baremo = rows('tstxdt').filter((r) => r.ID_TESTX === 8);
const bandRows = baremo.map((b) => rows('tstxdtr').filter((a) => a.ID_TSTXDT === b.ID_TSTXDT));
console.log('      baremo rows:', baremo.map((b, i) => `${b.REFERENCIA}=${bandRows[i].length}`).join(', '), 'sample', JSON.stringify(bandRows[0].slice(0, 3)));
const nums = docText('docs/Hoja de respuestas del C. I.doc').slice(docText('docs/Hoja de respuestas del C. I.doc').indexOf('DE MAS DE 45')).match(/\d+/g).map(Number).slice(1);
const docTable = new Map();
// Walk ascending raw scores only: other numbers follow the table in the document.
for (let i = 0; i + 3 < nums.length; i += 4) {
  const [raw, a, b, c] = nums.slice(i, i + 4);
  if ((docTable.size && raw !== Math.max(...docTable.keys()) + 1) || ![a, b, c].every((v) => v >= 50 && v <= 200)) break;
  docTable.set(raw, [a, b, c]);
}
let normChecked = 0;
let normBad = 0;
const normBadList = [];
bandRows.forEach((band, b) => {
  for (const a of band) {
    const doc = docTable.get(Number(a.RESPUESTA));
    if (!doc) continue;
    normChecked++;
    if (doc[b] !== a.PUNTOS) {
      normBad++;
      normBadList.push(`${baremo[b].REFERENCIA} raw ${a.RESPUESTA}: db ${a.PUNTOS} doc ${doc[b]}`);
    }
  }
});
// Decision 3: the database wins for the one known difference. Anything else is a failure.
// It is matched by cell, not value, so that no norm value is stored in this file.
const ACCEPTED_CELL = 'BAREMO MÁS DE 45 raw 30:';
const normNew = normBadList.filter((m) => !m.startsWith(ACCEPTED_CELL));
line(normChecked > 0 && normNew.length === 0, `Norms vs document: ${normChecked} cells compared, ${normBad} differ, ${normNew.length} unexpected (doc rows ${docTable.size})`);
for (const m of normNew.slice(0, 8)) console.log('      ', m);
bandRows.forEach((band, b) => {
  const raw = band.map((a) => Number(a.RESPUESTA)).sort((x, y) => x - y);
  const gaps = raw.filter((v, i) => i > 0 && v !== raw[i - 1] + 1);
  line(raw.length > 0 && gaps.length === 0, `Norm band ${baremo[b].REFERENCIA}: raw ${raw[0]}-${raw[raw.length - 1]}, ${gaps.length} gaps`);
});

// xl
const corrected = (t) => JSON.parse(readFileSync(join(OUT, 'corrected', `${t}.json`), 'utf8'));
const xl = corrected('xl').rows;
const have = new Set(xl.map((r) => r.SERIE));
const missing = [];
const perm = (pre, rest) => {
  if (!rest.length) {
    if (!have.has(pre)) missing.push(pre);
    return;
  }
  for (const c of rest) perm(pre + c, rest.replace(c, ''));
};
perm('', '01234567');
const invalid = xl.filter((r) => !/^[0-7]{8}$/.test(r.SERIE) || new Set(r.SERIE).size !== 8);
line(missing.length === 0 && invalid.length === 0, `xl: ${xl.length} rows, ${missing.length} permutations missing (${missing.join(',')}), ${invalid.length} invalid (${invalid.map((r) => `${r.ID_CRITERI}:${r.SERIE}=>${r.TIPOTEXTO}`).join(',')})`);

// Text codes
const codes = new Set(rows('txt').map((r) => r.TIPO));
const codesW = new Set(rows('txtW').map((r) => r.TIPO));
const allCodes = new Set([...codes, ...codesW]);
const expected = [];
const add = (p, a, b) => {
  for (let i = a; i <= b; i++) expected.push(`${p}${String(i).padStart(2, '0')}`);
};
add('CA', 0, 0); add('CB', 1, 9); add('CC', 0, 33); add('CD', 0, 31); add('CE', 1, 3); add('CF', 0, 0); add('CG', 1, 10); add('CH', 1, 14); add('CJ', 0, 0); add('CK', 1, 5); add('CL', 0, 0);
for (const c of new Set(xl.map((r) => r.TIPOTEXTO))) expected.push(c);
const has = (c) => [...allCodes].some((x) => x === c || (x.startsWith(c) && /^[A-Z]$/.test(x.slice(c.length))));
const absent = expected.filter((c) => !has(c));
line(absent.length === 0, `Text codes: ${expected.length - absent.length}/${expected.length} present; missing: ${absent.join(',') || 'none'}; distinct codes in db ${allCodes.size}`);

// Traits
const code = readdirSync(REPO).filter((f) => f.endsWith('.pas')).map((f) => readFileSync(join(REPO, f)).toString('latin1')).join('\n');
const named = [...new Set([...code.matchAll(/GetRasgo\('([^']+)'/g)].map((m) => m[1]))];
const traits = new Set([...rows('rgo'), ...rows('rgow')].map((r) => r.DESC_RASGO));
const noTrait = named.filter((n) => !traits.has(n));
// Decision 2: the new app keys traits by ID, so every engine name must map to one.
const traitIds = corrected('trait-ids');
const unmapped = named.filter((n) => !traitIds[n]);
line(unmapped.length === 0, `Traits: ${named.length - unmapped.length}/${named.length} GetRasgo names map to an ID; spelling differs from the database for: ${noTrait.join(', ') || 'none'}`);

// Decision 6: no profile rows without a parent.
const profiles = new Set(rows('pscgr').map((r) => r.ID_PSICOGRAFO));
const orphanRows = [...corrected('pscgrdt').rows, ...corrected('pscgrdtW').rows].filter((r) => !profiles.has(r.ID_PSICOGRAFO));
line(orphanRows.length === 0, `Profiles: ${orphanRows.length} corrected rows without a parent profile`);

// Spot check: saved report text vs database text
const report = norm(execFileSync('textutil', ['-convert', 'txt', '-stdout', join(REPO, 'aStream.rtf')]).toString('utf8'));
const all = [...texts('txt'), ...texts('txtW')].map((t) => ({ ...t, n: norm(t.plain) })).filter((t) => t.n.length > 80);
const hits = all.filter((t) => report.includes(t.n.slice(0, 80)));
// Decision 8: screenshot and book comparison is deferred, so this is informational.
console.log(`NOTE  Report spot check: ${hits.length} database texts appear verbatim in aStream.rtf (report ${report.length} chars)`);
for (const t of hits.slice(0, 10)) console.log(`      ${t.TIPO}: ${t.plain.slice(0, 70)}`);

// Encoding
const blob = JSON.stringify([...texts('txt'), ...texts('txtW')].map((t) => t.plain));
const accents = (blob.match(/[áéíóúñÁÉÍÓÚÑ]/g) ?? []).length;
const replacement = (blob.match(/�/g) ?? []).length;
const empty = [...texts('txt'), ...texts('txtW')].filter((t) => !t.plain.trim()).length;
line(accents > 100 && replacement === 0, `Encoding: ${accents} accented letters, ${replacement} replacement chars, ${empty} empty texts`);
