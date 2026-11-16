#!/usr/bin/env node
// Fails when the repo holds a file that must never be committed: legacy database files,
// binaries, scanned documents, content packs or private exports (MIGRATION_PLAN.md, Phase 1).
// Checks paths only, so it can't print or read restricted content.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_EXTENSIONS = ['dat', 'blb', 'idx', 'dtf', 'exe', 'pdf', 'bmp', 'rtf', 'doc', 'psivbackup', 'psivrespuesta'];
const FORBIDDEN_FOLDERS = ['oracle', 'export', 'export-restricted', 'psiv-private'];
const PACK_FILE = /\.(psivpack|pack)(\.[^./]+)*$/i;
// The demo pack holds synthetic content and is the only pack that may be committed.
const DEMO_PACK_FOLDER = 'public/demo/';

/** Returns why a repo-relative path is forbidden, or null when it is allowed. */
export function forbiddenReason(path) {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  const folder = parts.slice(0, -1).find((p) => FORBIDDEN_FOLDERS.includes(p.toLowerCase()));
  if (folder) return `inside a forbidden folder (${folder})`;
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (FORBIDDEN_EXTENSIONS.includes(extension)) return `forbidden file type (.${extension})`;
  if (PACK_FILE.test(name) && !path.startsWith(DEMO_PACK_FOLDER)) return 'content pack outside the demo folder';
  return null;
}

/** Tracked files, plus new files that .gitignore doesn't exclude. */
function listRepoFiles() {
  const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  return [...new Set(output.split('\0').filter(Boolean))];
}

function main() {
  const files = listRepoFiles();
  const problems = files.flatMap((path) => {
    const reason = forbiddenReason(path);
    return reason ? [`  ${path}: ${reason}`] : [];
  });
  if (problems.length > 0) {
    console.error(`Forbidden files found (${problems.length}):\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`No forbidden files in ${files.length} checked.`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
