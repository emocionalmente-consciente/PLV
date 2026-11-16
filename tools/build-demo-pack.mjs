#!/usr/bin/env -S npx tsx
// Writes the synthetic demo pack to public/demo, the one pack that may be committed. It runs the same
// checks as a real pack. Its passphrase is public, because it protects nothing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkExamineePack, checkManualsPack, checkOperatorPack } from '../src/content/checks';
import { encryptPack } from '../src/content/crypto';
import { DEMO_PASSPHRASE, demoExamineePack, demoManualsPack, demoOperatorPack } from '../src/content/demo-content';

const OUT = resolve(new URL('../public/demo', import.meta.url).pathname);
const operator = demoOperatorPack();
const manuals = demoManualsPack();
const examinee = demoExamineePack();
const problems = [...checkOperatorPack(operator), ...checkManualsPack(manuals), ...checkExamineePack(examinee, operator)];
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
for (const [name, content] of [['demo-core', operator], ['demo-manuals', manuals], ['demo-examinee', examinee]]) {
  const file = await encryptPack(content, DEMO_PASSPHRASE);
  writeFileSync(join(OUT, `${name}.psivpack`), file);
  console.log(`${name}.psivpack: ${(file.length / 1024).toFixed(0)} KB`);
}
