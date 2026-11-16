#!/usr/bin/env node
// Converts the exported RichView (RVF) blobs into HTML and plain text, keeping
// bold, italics, underline and paragraph alignment (DATA_EXTRACTION.md step 4).
// Writes ~/psiv-private/export/texts/<table>.json and images/<table>-*.bmp.
//
// RVF layout: "-8 1 2" CRLF, then items. An item header is
//   style lineCount para options tagMode tag...
// followed by lineCount lines. para -1 continues the previous paragraph.
// style -3 is a picture: an empty name line, the class name, then u32 size and the bitmap.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = join(homedir(), 'psiv-private', 'export');
const LEGACY = process.env.PSIV_LEGACY_DIR ?? join(homedir(), 'Desktop', 'PsIV');
const REPO_DB = pathToFileURL(join(LEGACY, 'Db/'));

const TABLES = [
  { table: 'txt', blob: 'TEXTO', key: 'ID_TEXTO', dtf: 'txtz.Dtf' },
  { table: 'txtW', blob: 'TEXTO', key: 'ID_TEXTO', dtf: 'txtzW.Dtf' },
  { table: 'txtm', blob: 'TEXTOM', key: 'ID_TEXTOM', dtf: 'txtzW.Dtf' },
  { table: 'tstxdtW', blob: 'BLOBTST', key: 'ID_TSTXDT', dtf: 'txtzW.Dtf' },
];

function loadStyles(file) {
  const ini = readFileSync(new URL(file, REPO_DB)).toString('latin1');
  const fonts = {};
  const paras = {};
  for (const line of ini.split(/\r?\n/)) {
    let m = line.match(/^Font(Bold|Italic|Underline)(\d+)=Yes$/);
    if (m) (fonts[m[2]] ??= {})[m[1]] = true;
    m = line.match(/^ParaAlignment(\d+)=(\d+)$/);
    if (m) paras[m[1]] = { 1: 'right', 2: 'center', 3: 'justify' }[m[2]];
  }
  return { fonts, paras };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function parse(d) {
  const problems = [];
  const items = [];
  const lineEnd = (p) => {
    const e = d.indexOf('\r\n', p, 'latin1');
    return e < 0 ? d.length : e;
  };
  let p = lineEnd(0) + 2;
  while (p < d.length) {
    const e = lineEnd(p);
    const head = d.toString('latin1', p, e);
    if (head === '' && e + 2 >= d.length) break;
    const m = head.match(/^(-?\d+) (\d+) (-?\d+)( -?\d+)*$/);
    if (!m) {
      problems.push(`bad item header at ${p}: ${head.slice(0, 40)}`);
      break;
    }
    const style = Number(m[1]);
    const count = Number(m[2]);
    const para = Number(m[3]);
    p = e + 2;
    if (style === -3) {
      const nameEnd = lineEnd(p);
      p = nameEnd + 2;
      const clsEnd = lineEnd(p);
      const cls = d.toString('latin1', p, clsEnd);
      p = clsEnd + 2;
      const size = d.readUInt32LE(p);
      items.push({ style, para, picture: d.subarray(p + 4, p + 4 + size), cls });
      p += 4 + size;
      if (d.toString('latin1', p, p + 2) === '\r\n') p += 2;
      continue;
    }
    const lines = [];
    for (let i = 0; i < count; i++) {
      const le = lineEnd(p);
      lines.push(d.toString('latin1', p, le));
      p = le + 2;
    }
    items.push({ style, para, lines });
  }
  return { items, problems };
}

function render(items, styles, baseName, images) {
  const paragraphs = [];
  let current = null;
  const open = (para) => {
    current = { para, html: '', text: '' };
    paragraphs.push(current);
  };
  let pictures = 0;
  for (const it of items) {
    if (it.para !== -1 || !current) open(it.para === -1 ? 0 : it.para);
    if (it.picture) {
      const name = `${baseName}-${++pictures}.bmp`;
      images.push([name, it.picture]);
      current.html += `<img src="images/${name}" alt="">`;
      continue;
    }
    const font = styles.fonts[it.style] ?? {};
    it.lines.forEach((line, i) => {
      if (i > 0) open(it.para === -1 ? current.para : it.para);
      let h = esc(line);
      if (h === '') return;
      if (font.Underline) h = `<u>${h}</u>`;
      if (font.Italic) h = `<em>${h}</em>`;
      if (font.Bold) h = `<strong>${h}</strong>`;
      current.html += h;
      current.text += line;
    });
  }
  const html = paragraphs
    .map((x) => {
      const align = styles.paras[x.para];
      return `<p${align ? ` style="text-align:${align}"` : ''}>${x.html}</p>`;
    })
    .join('\n');
  return { html, plain: paragraphs.map((x) => x.text).join('\n') };
}

mkdirSync(join(OUT, 'texts'), { recursive: true });
mkdirSync(join(OUT, 'images'), { recursive: true });

for (const { table, blob, key, dtf } of TABLES) {
  const styles = loadStyles(dtf);
  const rows = JSON.parse(readFileSync(join(OUT, `${table}.json`), 'utf8')).rows;
  const out = [];
  const problems = [];
  const images = [];
  const usedStyles = new Set();
  for (const r of rows) {
    if (!r[blob]) continue;
    const d = readFileSync(join(OUT, r[blob].blob));
    const parsed = parse(d);
    for (const pr of parsed.problems) problems.push(`${table} ${r[key]}: ${pr}`);
    for (const it of parsed.items) usedStyles.add(it.style);
    const { [blob]: _omit, ...rest } = r;
    out.push({ ...rest, ...render(parsed.items, styles, `${table}-${r[key]}`, images) });
  }
  writeFileSync(join(OUT, 'texts', `${table}.json`), `${JSON.stringify(out, null, 1)}\n`);
  for (const [name, data] of images) writeFileSync(join(OUT, 'images', name), data);
  console.log(`${table}: ${out.length} texts, ${images.length} images, ${problems.length} parse problems, styles ${[...usedStyles].sort((a, b) => a - b).join(',')}`);
  for (const pr of problems.slice(0, 5)) console.log('  !', pr);
}
