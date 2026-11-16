import { describe, expect, it } from 'vitest';
import { forbiddenReason } from './check-forbidden.mjs';

describe('forbiddenReason', () => {
  it.each([
    'Db/txt.DAT',
    'txt.dat',
    'Db/txt.BLB',
    'Db/txt.IDX',
    'Db/txtz.Dtf',
    'P4_Durango.exe',
    'docs/book.pdf',
    'docs/book.PDF',
    'images/ci-1.bmp',
    'aStream.rtf',
    'docs/Preguntas del CI.doc',
    'operator.psivpack',
    'respaldo.psivbackup',
    'content/operator.pack.json',
    'content/operator.pack.enc',
    'oracle/color.json',
    'src/oracle/color.json',
    'export/txt.json',
    'nested/export-restricted/prs.json',
    'psiv-private/notes.md',
  ])('rejects %s', (path) => {
    expect(forbiddenReason(path)).not.toBeNull();
  });

  it.each([
    'src/app/App.tsx',
    'docs/migration/DATA_MODEL.md',
    'tools/build-oracle.mjs',
    'tools/dbisam-export.mjs',
    'src/export.ts',
    'public/demo/demo.pack.json',
    'package.json',
    '.tool-versions',
  ])('allows %s', (path) => {
    expect(forbiddenReason(path)).toBeNull();
  });
});
