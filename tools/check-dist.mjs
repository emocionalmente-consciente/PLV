#!/usr/bin/env -S npx tsx
// Checks that the built site holds no restricted content.
//
// Everywhere, including CI: dist/ holds only expected file types, and the only packs are the demo
// packs, which must open with the public passphrase and hold the synthetic content.
//
// Where ~/psiv-private exists, it also searches dist/, the decrypted demo packs and the repo's text
// files for restricted strings: report texts, test items, manuals, norm tables and the CI key. The
// strings stay in the private folder, because listing them here would publish them. It prints file
// names and counts only.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decryptPack } from '../src/content/crypto';
import { DEMO_PASSPHRASE } from '../src/content/demo-content';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DIST = join(ROOT, 'dist');
const EXPORT = join(homedir(), 'psiv-private', 'export');
const ALLOWED_TYPES = new Set(['.html', '.js', '.css', '.svg', '.ico', '.txt', '.json', '.map', '.psivpack']);
const DEMO_PACK = /^demo\/demo-(core|manuals|examinee)\.psivpack$/;
const MIN_NEEDLE = 30;

/** Lower case with tags, accents, punctuation and spaces removed, so markup and layout don't hide a match. */
export function normalize(text) {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/<[^>]*>/g, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Returns how many needles appear in a text. Both must already be normalized. */
export function countMatches(haystack, needles) {
  let count = 0;
  for (const needle of needles) if (haystack.includes(needle)) count++;
  return count;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function restrictedNeedles() {
  const read = (...parts) => JSON.parse(readFileSync(join(EXPORT, ...parts), 'utf8'));
  const raw = [];
  for (const name of ['txt', 'txtW', 'txtm', 'tstxdtW']) {
    for (const row of read('texts', `${name}.json`)) raw.push(...String(row.plain ?? '').split('\n'));
  }
  const tstxdt = read('tstxdt.json').rows;
  const answers = read('tstxdtr.json').rows;
  for (const row of tstxdt.filter((r) => r.ID_TESTX === 8)) {
    raw.push(answers.filter((a) => a.ID_TSTXDT === row.ID_TSTXDT).sort((a, b) => a.OPCION - b.OPCION).map((a) => a.PUNTOS).join(' '));
  }
  const ci = tstxdt.filter((r) => r.ID_TESTX === 4).sort((a, b) => a.ORDEN - b.ORDEN);
  raw.push(ci.map((r) => answers.find((a) => a.ID_TSTXDT === r.ID_TSTXDT && a.PUNTOS > 0)?.RESPUESTA ?? '').join(''));
  // The percentage rows are short once normalized, but specific enough to search for at any length.
  const exact = [];
  const norms = join(homedir(), 'psiv-private', 'norms', 'norm-profiles.json');
  if (existsSync(norms)) {
    for (const profile of JSON.parse(readFileSync(norms, 'utf8'))) {
      const row = ['0', '1', '2', '3', '4', '5', '6', '7'].map((digit) => profile.colorReference[digit]);
      // A file could write either 3.5 or 3.50, so both forms are searched for.
      exact.push(row.map((value) => value.toFixed(2)).join(' '), row.map(String).join(' '));
      for (const note of profile.interpretiveNotes) raw.push(note.text);
    }
  }
  // The examinee pack key isn't personal, but it has no reason to be in the site or the repo.
  const packKey = join(homedir(), 'psiv-private', 'examinee-pack.key');
  if (existsSync(packKey)) exact.push(readFileSync(packKey, 'utf8').trim());
  return [...new Set([...raw.map(normalize).filter((n) => n.length >= MIN_NEEDLE), ...exact.map(normalize)])];
}

async function main() {
  const problems = [];
  if (!existsSync(DIST)) {
    console.error('dist/ is missing. Run the build first.');
    process.exit(1);
  }
  const files = walk(DIST);
  const demoTexts = [];
  for (const path of files) {
    const name = relative(DIST, path).split('\\').join('/');
    const type = extname(path).toLowerCase();
    if (!ALLOWED_TYPES.has(type)) problems.push(`${name}: file type not expected in the site`);
    if (type === '.psivpack') {
      if (!DEMO_PACK.test(name)) {
        problems.push(`${name}: only demo packs may be in the site`);
        continue;
      }
      const content = await decryptPack(new Uint8Array(readFileSync(path)), DEMO_PASSPHRASE).catch(() => null);
      if (content === null) problems.push(`${name}: doesn't open with the public demo passphrase`);
      else {
        if (!String(content.contentVersion).startsWith('demo-')) problems.push(`${name}: isn't marked as demo content`);
        demoTexts.push([name, JSON.stringify({ ...content, assets: {} })]);
      }
    }
  }
  console.log(`dist: ${files.length} files, ${demoTexts.length} demo packs opened`);

  if (existsSync(EXPORT)) {
    const needles = restrictedNeedles();
    const repoFiles = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
      .split('\0')
      .filter(Boolean)
      .filter((f) => !f.endsWith('.psivpack') && !f.endsWith('package-lock.json') && existsSync(join(ROOT, f)));
    const targets = [
      ...files.filter((f) => !f.endsWith('.psivpack')).map((f) => [`dist/${relative(DIST, f)}`, readFileSync(f, 'utf8')]),
      ...demoTexts.map(([name, text]) => [`decrypted ${name}`, text]),
      ...repoFiles.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]),
    ];
    let total = 0;
    for (const [name, text] of targets) {
      const found = countMatches(normalize(text), needles);
      if (found > 0) problems.push(`${name}: ${found} restricted strings`);
      total++;
    }
    console.log(`restricted search: ${needles.length} strings in ${total} files`);
  } else {
    console.log('restricted search: skipped, the private folder is not here');
  }

  if (problems.length > 0) {
    console.error(`Problems (${problems.length}):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(existsSync(EXPORT) ? 'No restricted content found.' : 'File types and demo packs are fine. Run this on your machine to search for restricted strings.');
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
