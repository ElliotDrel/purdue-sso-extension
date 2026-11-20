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
assert.equal(manifest.incognito, 'not_allowed', 'Profile account hints must never be injected into private browsing');
assert.equal(manifest.version, packageJson.version, 'Keep extension and package versions aligned');
assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'declarativeNetRequestWithHostAccess', 'webNavigation']);
assert.deepEqual(manifest.host_permissions, ['https://outlook.office.com/*', 'https://outlook.cloud.microsoft/*']);
assert.deepEqual(manifest.background, { service_worker: 'outlook-background.js' });
assert.deepEqual(manifest.content_scripts[1], {
  matches: ['https://outlook.office.com/*', 'https://outlook.cloud.microsoft/*'],
  js: ['outlook-account.js', 'outlook-page.js'], run_at: 'document_start', all_frames: false,
});
assert.deepEqual(manifest.content_scripts[0].matches, [
  'https://sso.purdue.edu/*',
  'https://idp.purdue.edu/*',
  'https://login.microsoftonline.com/*',
  'https://purdue.brightspace.com/*',
]);
assert.equal(manifest.content_scripts[0].all_frames, false);
console.log('Passed: Chrome manifest scope.');

async function runContent(enabled, overrides = {}, exercise = async () => {}) {
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
  const otp = new Input();
  let showPassword = false;
  let showOtp = false;
  otp.getClientRects = () => showOtp ? [{}] : [];
  let changed;
  let mutate;
  let now = Math.floor(Date.now() / 30_000) * 30_000;
  let startSigning;
  let releaseSigning;
  const signingStarted = new Promise(resolve => { startSigning = resolve; });
  const signingReleased = new Promise(resolve => { releaseSigning = resolve; });
  const next = { value: 'Next', getAttribute: () => null, closest: () => null,
    getClientRects: () => [{}], click: () => { submits++; } };
  const context = vm.createContext({
    URL, console, HTMLInputElement: Input,
    crypto: { subtle: {
      importKey: (...args) => webcrypto.subtle.importKey(...args),
      async sign(...args) {
        startSigning();
        await signingReleased;
        return webcrypto.subtle.sign(...args);
      },
    } },
    Event: class { constructor(type) { this.type = type; } },
    location: { protocol: 'https:', hostname: 'login.microsoftonline.com',
      pathname: '/4130bd39-7c53-419c-b1e5-8758d6d63f21/login' },
    sessionStorage: { getItem: () => null, setItem() {} },
    getComputedStyle: () => ({ visibility: 'visible' }),
    Date: class extends Date { static now() { return now; } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { mutate = this.callback; }
      disconnect() { mutate = undefined; }
    },
    setInterval: () => 1,
    clearInterval() {}, clearTimeout() {}, setTimeout: () => 1,
    document: { visibilityState: 'hidden', hidden: true, documentElement: {}, body: { innerText: 'Sign in Next' },
      querySelector: () => null, querySelectorAll(selector) {
      if (selector.startsWith('#displayName')) return [];
      if (selector === 'input[type="password"]' && showPassword) return [password];
      if (selector.startsWith('#idTxtBx_SAOTCC_OTC') && showOtp) return [otp];
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
  await exercise({
    password, otp, signingStarted, releaseSigning,
    renderPassword() { showOtp = false; showPassword = true; next.value = 'Sign in'; },
    renderOtp() { showOtp = true; next.value = 'Verify'; context.document.body.innerText = 'Enter a verification code'; },
    get mutate() { return mutate; },
    expire() { now += 180_001; },
    change: changed,
    runTick: context.runTick,
  });
  return { submits, storageReads, username: username.value };
}

assert.deepEqual(await runContent(false), { submits: 0, storageReads: 1, username: '' });
assert.deepEqual(await runContent(true), { submits: 1, storageReads: 1, username: 'test@purdue.edu' });
assert.equal((await runContent(true, { email: 'test' })).submits, 0, 'Partial addresses never start automatic sign-in');
assert.equal((await runContent(true, { setup_complete: false })).submits, 0, 'Enrollment confirmation is required');
await runContent(true, {}, async page => {
  page.renderPassword();
  page.change({ enabled: { newValue: false } }, 'local');
  assert.equal(page.mutate, undefined, 'Disabling setup disconnects the observer');
  await page.runTick();
  assert.equal(page.password.value, '', 'Disabling or editing setup must stop use of captured credentials');
});
console.log('Passed: Chrome startup stays off until enabled and submits the configured Purdue account.');

const background = await runContent(true, {}, async page => {
  page.renderPassword();
  assert.equal(page.password.value, '', 'Polling is stalled while the next form renders');
  await page.mutate();
  assert.equal(page.password.value, 'dummy', 'A hidden page advances on form changes alone');
  await page.mutate();
  page.change({ manual_pause_until: { newValue: -1 } }, 'local');
  assert.equal(page.mutate, undefined, 'Manual pause disconnects the observer');
  page.change({ manual_pause_until: { newValue: 0 } }, 'local');
  assert.equal(typeof page.mutate, 'function', 'Resuming reconnects the observer');
  page.expire();
  await page.mutate();
  assert.equal(page.mutate, undefined, 'An expired attempt disconnects the observer');
});
assert.equal(background.submits, 2, 'Username and password each submit once');

const replacedForm = await runContent(true, {}, async page => {
  page.renderOtp();
  const check = page.mutate();
  await page.signingStarted;
  page.renderPassword();
  await page.mutate();
  assert.equal(page.password.value, '', 'The current check is still generating a code');
  page.releaseSigning();
  await check;
  assert.equal(page.otp.value, '', 'A removed verification form receives no code');
  assert.equal(page.password.value, 'dummy', 'The queued mutation advances the new form without polling');
});
assert.equal(replacedForm.submits, 2, 'Only the username and replacement form submit');

const expiredAttempt = await runContent(true, {}, async page => {
  page.renderOtp();
  const check = page.mutate();
  await page.signingStarted;
  page.expire();
  page.releaseSigning();
  await check;
  assert.equal(page.otp.value, '', 'A verification code is not filled after the attempt expires');
  assert.equal(page.mutate, undefined, 'An attempt that expires during a check disconnects without another event');
});
assert.equal(expiredAttempt.submits, 1);
console.log('Passed: hidden-tab form changes advance sign-in without polling.');
