import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { generateTotp } from './reference-totp.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const content = await readFile(new URL('setup-core.js', root), 'utf8') + '\n' + await readFile(new URL('content.js', root), 'utf8');

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, packageJson.version, 'Keep extension and package versions aligned');
assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.background, undefined, 'Automatic sign-in needs no background worker');
assert.deepEqual(manifest.content_scripts[0].matches, [
  'https://sso.purdue.edu/*',
  'https://idp.purdue.edu/*',
  'https://login.microsoftonline.com/*',
  'https://purdue.brightspace.com/*',
]);
assert.equal(manifest.content_scripts[0].all_frames, false);
console.log('Passed: Chrome manifest scope.');

async function runContent(enabled, overrides = {}, changeConfiguration = false) {
  let submits = 0;
  let storageReads = 0;
  class Input {
    constructor() { this._value = ''; }
    set value(value) { this._value = value; }
    get value() { return this._value; }
    getAttribute() { return null; }
    closest() { return null; }
    getClientRects() { return [{}]; }
    dispatchEvent() {}
  }
  const username = new Input();
  const password = new Input();
  let showPassword = false;
  let changed;
  const next = { value: 'Next', getAttribute: () => null, closest: () => null,
    getClientRects: () => [{}], click: () => { submits++; } };
  const context = vm.createContext({
    URL, crypto: webcrypto, console, HTMLInputElement: Input,
    Event: class { constructor(type) { this.type = type; } },
    location: { protocol: 'https:', hostname: 'login.microsoftonline.com',
      pathname: '/4130bd39-7c53-419c-b1e5-8758d6d63f21/login' },
    sessionStorage: { getItem: () => null, setItem() {} },
    getComputedStyle: () => ({ visibility: 'visible' }),
    setInterval: () => 1,
    clearInterval() {}, clearTimeout() {}, setTimeout: () => 1,
    document: { body: { innerText: 'Sign in Next' }, querySelector: () => null, querySelectorAll(selector) {
      if (selector.startsWith('#displayName')) return [];
      if (selector === 'input[type="password"]' && showPassword) return [password];
      if (selector.startsWith('input[name="loginfmt"]')) return [username];
      if (selector.startsWith('button, a,')) return [next];
      return [];
    } },
    chrome: { storage: { onChanged: { addListener(handler) { changed = handler; } }, local: { async get() {
      storageReads++;
      return { email: 'test@purdue.edu', setup_complete: true, password: 'dummy',
        totp_uri: 'otpauth://totp/Test?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', enabled, ...overrides };
    } } }, runtime: { onMessage: { addListener() {} } } },
  });
  const exposed = content.replace(/\s+scheduleTicks\(\);\s*\}\)\(\);\s*$/, '\n  globalThis.runTick = tick;\n  scheduleTicks();\n})();');
  await vm.runInContext(exposed, context);
  if (changeConfiguration) {
    showPassword = true;
    next.value = 'Sign in';
    changed({ enabled: { newValue: false } }, 'local');
    await context.runTick();
    assert.equal(password.value, '', 'Disabling or editing setup must stop use of captured credentials');
  }
  return { submits, storageReads, username: username.value };
}

assert.deepEqual(await runContent(false), { submits: 0, storageReads: 1, username: '' });
assert.deepEqual(await runContent(true), { submits: 1, storageReads: 1, username: 'test@purdue.edu' });
assert.equal((await runContent(true, { email: 'test' })).submits, 0, 'Partial addresses never start automatic sign-in');
assert.equal((await runContent(true, { setup_complete: false })).submits, 0, 'Enrollment confirmation is required');
await runContent(true, {}, true);
console.log('Passed: Chrome startup stays off until enabled and submits the configured Purdue account.');
