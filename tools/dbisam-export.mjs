#!/usr/bin/env node
// Exports the allowlisted legacy DBISAM 3.21 tables to UTF-8 JSON (DATA_EXTRACTION.md step 5).
//
// Reads ~/psiv-private/Db and writes ~/psiv-private/export. Person tables are refused.
// The format needs no password and no key: every structure is XORed with a fixed
// 128-byte pattern, restarting at 0 for each descriptor, record and blob payload.
//
//   .DAT  127-byte header, then 768 bytes per field, then fixed-size records
//         header: u32@4 blob block size, u16@0x15 record size, u16@0x17 field count
//         field:  u8@2 name length, name@3, u8@84 BDE type, u8@85 subtype,
//                 u16@86 size, u16@88 physical size, u16@90 offset
//         record: u8@0 deleted flag, then fields at their offset
//         AutoInc has no null flag; all other fields have a 1-byte flag before the value
//   .BLB  512-byte header, then blocks of the block size, numbered from 1
//         block:  u32@0 previous, u32@4 next, u16@8 used bytes, u32@10 blob id,
//                 u32@14 total size (first block only), then the payload at 18
//         A blob field holds u32 first block, u32 blob id.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// --restricted reads Db-restricted and writes export-restricted: examinee, security and
// screen-art tables, which must stay out of the content pack. The default run refuses them.
const RESTRICTED = process.argv.includes('--restricted');
const ROOT = join(homedir(), 'psiv-private');
const DB = join(ROOT, RESTRICTED ? 'Db-restricted' : 'Db');
const OUT = join(ROOT, RESTRICTED ? 'export-restricted' : 'export');
const BLOBS = join(OUT, 'blobs');
const REFUSED = /^(prs|prstst|prststc|prststx|prsclf|MDgr|MDgrL|Sac|Sga|Sgr|Sua|Sur)\./i;
// --restricted also recovers rows flagged deleted in the examinee tables, into deleted/<table>.json.
const EXAMINEE = /^(prs|prstst|prststc|prststx|prsclf)$/i;
const pad = (n, w = 2) => String(n).padStart(w, '0');
// Delphi TTimeStamp: day 1 is 0001-01-01, so 1970-01-01 is day 719163.
const UNIX_DAY = 719163;
const dayToIso = (d) => {
  const t = new Date((d - UNIX_DAY) * 86400000);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};
const msToTime = (ms) => `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}`;

const A = [0xe9, 0xe9, 0xe5, 0xe5, 0xe1, 0xe1, 0xe5, 0xe5, 0xe9, 0xe9, 0xf5, 0xf5, 0xf1, 0xf1, 0xf5, 0xf5];
const LOW = [0, 0, 0x0c, 0x0c, 0x08, 0x08, 0x0c, 0x0c, 0, 0];
const P = [];
for (const hi of [0x89, 0xc9, 0x09, 0xc9]) P.push(...A, ...LOW.map((d) => hi ^ d), 0xf5, 0xf5, 0xf1, 0xf1, 0xf5, 0xf5);

// Some tables (MDgr, MDgrL) are stored without the pattern; exportTable detects this.
let scrambled = true;
const dec = (buf) => {
  if (!scrambled) return buf;
  const out = Buffer.allocUnsafe(buf.length);
  for (let j = 0; j < buf.length; j++) out[j] = buf[j] ^ P[j % 128];
  return out;
};

const BDE = { STRING: 1, DATE: 2, BLOB: 3, BOOL: 4, INT16: 5, INT32: 6, FLOAT: 7, TIME: 10, TIMESTAMP: 11, UINT16: 12, UINT32: 13 };
const HEADER = 127;
const DESC = 768;
const BLB_HEADER = 512;
const BLOCK_HEADER = 18;

function readBlob(blb, blockSize, first, id, issues, where) {
  const parts = [];
  let block = first;
  const seen = new Set();
  const firstStart = BLB_HEADER + (first - 1) * blockSize;
  const total = dec(blb.subarray(firstStart, firstStart + BLOCK_HEADER)).readUInt32LE(14);
  let got = 0;
  // Stop at the declared total: the last links of large blobs point at stale blocks.
  while (block !== 0 && got < total) {
    if (seen.has(block)) {
      issues.push(`${where}: blob chain loop at block ${block}`);
      break;
    }
    seen.add(block);
    const start = BLB_HEADER + (block - 1) * blockSize;
    if (start + blockSize > blb.length) {
      issues.push(`${where}: block ${block} past end of file`);
      break;
    }
    const head = dec(blb.subarray(start, start + BLOCK_HEADER));
    const next = head.readUInt32LE(4);
    const used = head.readUInt16LE(8);
    if (used > blockSize - BLOCK_HEADER) {
      issues.push(`${where}: block ${block} used=${used} too large`);
      break;
    }
    if (head.readUInt32LE(10) !== id) issues.push(`${where}: block ${block} belongs to blob ${head.readUInt32LE(10)}, expected ${id}`);
    parts.push(dec(blb.subarray(start + BLOCK_HEADER, start + BLOCK_HEADER + used)));
    got += used;
    block = next;
  }
  const data = Buffer.concat(parts).subarray(0, total);
  if (data.length !== total) issues.push(`${where}: blob size ${data.length}, header says ${total}`);
  return data;
}

function exportTable(name) {
  const b = readFileSync(join(DB, `${name}.DAT`));
  const blockSize = b.readUInt32LE(4);
  const recSize = b.readUInt16LE(0x15);
  const fieldCount = b.readUInt16LE(0x17);
  const headerDeleted = b.readUInt32LE(9);
  const headerNext = b.readUInt32LE(0x0d);
  const dataStart = HEADER + fieldCount * DESC;
  const issues = [];
  // A field name of plain identifier characters on disk means the table isn't scrambled.
  const rawNameLen = b[HEADER + 2];
  scrambled = !/^[A-Za-z_][A-Za-z0-9_]*$/.test(b.toString('latin1', HEADER + 3, HEADER + 3 + rawNameLen));

  const fields = [];
  for (let d = 0; d < fieldCount; d++) {
    const raw = dec(b.subarray(HEADER + d * DESC, HEADER + (d + 1) * DESC));
    fields.push({
      name: raw.subarray(3, 3 + raw[2]).toString('latin1'),
      type: raw[84],
      subtype: raw[85],
      size: raw.readUInt16LE(86),
      phys: raw.readUInt16LE(88),
      offset: raw.readUInt16LE(90),
    });
  }

  const body = b.length - dataStart;
  if (body % recSize !== 0) issues.push(`body ${body} is not a multiple of record size ${recSize}`);
  const physical = Math.floor(body / recSize);
  const blbPath = join(DB, `${name}.BLB`);
  const blb = existsSync(blbPath) ? readFileSync(blbPath) : null;
  const rows = [];
  const recovered = [];
  const recoverDeleted = RESTRICTED && EXAMINEE.test(name);
  let deleted = 0;
  let blobCount = 0;
  const blobDir = join(BLOBS, name);

  for (let n = 0; n < physical; n++) {
    const r = dec(b.subarray(dataStart + n * recSize, dataStart + (n + 1) * recSize));
    if (r[0] !== 0 && r[0] !== 1) issues.push(`row ${n}: unexpected deleted flag ${r[0]}`);
    const isDeleted = r[0] !== 0;
    if (isDeleted) {
      deleted++;
      if (!recoverDeleted) continue;
    }
    const row = {};
    for (const f of fields) {
      const auto = f.type === BDE.INT32 && f.subtype === 0x1d;
      const at = auto ? f.offset : f.offset + 1;
      if (!auto && r[f.offset] === 0) {
        row[f.name] = null;
        continue;
      }
      switch (f.type) {
        case BDE.STRING: {
          const v = r.subarray(at, at + f.phys);
          const end = v.indexOf(0);
          row[f.name] = v.subarray(0, end < 0 ? v.length : end).toString('latin1');
          break;
        }
        case BDE.INT32:
          row[f.name] = r.readInt32LE(at);
          break;
        case BDE.INT16:
          row[f.name] = r.readInt16LE(at);
          break;
        case BDE.UINT16:
          row[f.name] = r.readUInt16LE(at);
          break;
        case BDE.UINT32:
          row[f.name] = r.readUInt32LE(at);
          break;
        case BDE.BOOL:
          row[f.name] = r[at] !== 0;
          break;
        case BDE.FLOAT:
          row[f.name] = r.readDoubleLE(at);
          break;
        case BDE.DATE:
          row[f.name] = dayToIso(r.readInt32LE(at));
          break;
        case BDE.TIME:
          row[f.name] = msToTime(r.readInt32LE(at));
          break;
        case BDE.TIMESTAMP: {
          const ms = r.readDoubleLE(at);
          const day = Math.floor(ms / 86400000);
          row[f.name] = `${dayToIso(day)}T${msToTime(ms - day * 86400000)}`;
          break;
        }
        case BDE.BLOB: {
          const first = r.readUInt32LE(at);
          const id = r.readUInt32LE(at + 4);
          if (!blb) {
            issues.push(`row ${n}: blob field but no BLB file`);
            row[f.name] = null;
            break;
          }
          const data = readBlob(blb, blockSize, first, id, issues, `row ${n}.${f.name}`);
          mkdirSync(blobDir, { recursive: true });
          const file = `${n}.${f.name}.bin`;
          writeFileSync(join(blobDir, file), data);
          row[f.name] = { blob: `blobs/${name}/${file}`, size: data.length };
          blobCount++;
          break;
        }
        default:
          issues.push(`field ${f.name}: unsupported BDE type ${f.type}`);
          row[f.name] = r.subarray(at, at + f.phys).toString('hex');
      }
    }
    (isDeleted ? recovered : rows).push(row);
  }

  writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify({ table: name, fields, rows }, null, 1)}\n`);
  if (recoverDeleted) {
    mkdirSync(join(OUT, 'deleted'), { recursive: true });
    writeFileSync(join(OUT, 'deleted', `${name}.json`), `${JSON.stringify({ table: name, fields, rows: recovered }, null, 1)}\n`);
  }
  return { name, scrambled, recSize, physical, live: rows.length, deleted, headerDeleted, headerNext, blobCount, blockSize, types: [...new Set(fields.map((f) => f.type))], issues };
}

mkdirSync(BLOBS, { recursive: true });
const names = readdirSync(DB)
  .filter((f) => /\.DAT$/i.test(f))
  .filter((f) => RESTRICTED || !REFUSED.test(f))
  .map((f) => f.replace(/\.DAT$/i, ''))
  .sort();

const report = names.map(exportTable);
for (const t of report) {
  console.log(
    t.name.padEnd(10),
    `phys=${String(t.physical).padStart(6)} live=${String(t.live).padStart(6)} del=${String(t.deleted).padStart(4)}`,
    `hdrDel=${String(t.headerDeleted).padStart(4)} hdrNext=${String(t.headerNext).padStart(6)}`,
    `blobs=${String(t.blobCount).padStart(4)} blk=${t.blockSize} types=${t.types.join('/')}`,
    `issues=${t.issues.length}`,
  );
  for (const i of t.issues.slice(0, 5)) console.log('   !', i);
}
writeFileSync(join(OUT, '_report.json'), `${JSON.stringify(report, null, 1)}\n`);
