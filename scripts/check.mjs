import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
assert.equal(manifest.version, pkg.version, 'Manifest and package versions must match');
for (const file of ['content.js', 'setup-core.js', 'options.js', 'popup.js', 'scripts/check.mjs', 'scripts/package.mjs']) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Passed: JavaScript syntax and release version consistency.');
