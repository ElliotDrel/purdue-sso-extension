const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const core = read('setup-core.js');
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const uri = `otpauth://totp/Test?secret=${secret}`;

async function setup(initial = {}) {
  let now = 59_000;
  let failSave = false;
  const store = { ...initial };
  const handlers = {};
  const timers = [];
  const copied = [];
  const nodes = {};
  for (const [, id] of read('options.html').matchAll(/id="([^"]+)"/g)) {
    nodes[id] = {
      value: '', textContent: '', checked: false, disabled: id === 'finish-setup', hidden: false,
      type: id === 'password' || id === 'totp_uri' ? 'password' : 'text',
      attributes: {}, classList: { toggle() {} },
      addEventListener(type, handler) { handlers[`${id}:${type}`] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      focus() { this.focused = true; },
    };
  }
  const context = vm.createContext({
    URL, crypto: webcrypto, console,
    Date: class extends Date { static now() { return now; } },
    setInterval(handler) { timers.push(handler); return timers.length; }, clearInterval() {},
    window: { addEventListener() {} },
    navigator: { clipboard: { async writeText(value) { copied.push(value); } } },
    document: { querySelector: selector => nodes[selector.slice(1)] },
    chrome: { storage: { local: {
      async get() { return { ...store }; },
      async set(values) { if (failSave) throw new Error('Synthetic storage failure'); Object.assign(store, values); },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key]; },
    } } },
  });
  vm.runInContext(core, context);
  await vm.runInContext(`(async () => { ${read('options.js')} })()`, context);
  return {
    nodes, store, timers, copied, api: context.PurdueSetup,
    setTime(value) { now = value; }, failSave(value) { failSave = value; },
    async fire(id, type = 'click') { await handlers[`${id}:${type}`]({ preventDefault() {} }); },
  };
}
async function account(page, email = 'you@purdue.edu') {
  page.nodes.email.value = email;
  page.nodes.password.value = ' password with spaces ';
  await page.fire('account-form', 'submit');
}
async function enrollment(page) {
  await account(page);
  page.nodes.totp_uri.value = secret;
  await page.fire('authenticator-form', 'submit');
}
async function confirm(page) {
  page.nodes['enrollment-confirmed'].checked = true;
  await page.fire('enrollment-confirmed', 'change');
  await page.fire('finish-setup');
}

test('only full Purdue addresses are accepted, with clear field feedback', async () => {
  const page = await setup();
  for (const email of ['you', 'you@', 'you@gmail.com', '@purdue.edu', 'you@@purdue.edu', 'you name@purdue.edu', '.you@purdue.edu', 'you..name@purdue.edu', 'you<name>@purdue.edu', '']) {
    await account(page, email);
    assert.equal(page.store.email, undefined);
    assert.match(page.nodes['email-error'].textContent, /full Purdue email/);
    assert.equal(page.nodes['step-1'].hidden, false);
  }
  await account(page, ' YOU@PURDUE.EDU ');
  assert.equal(page.store.email, 'you@purdue.edu');
  assert.equal(page.store.password, ' password with spaces ');
  assert.equal(page.store.enabled, false);
  assert.equal(page.store.setup_complete, false);
  assert.equal(page.nodes['step-2'].hidden, false);
});
test('verification precedes automation and cannot be bypassed by clicking finish', async () => {
  const page = await setup();
  await enrollment(page);
  assert.equal(page.store.enabled, false);
  assert.equal(page.store.setup_complete, false);
  assert.equal(page.nodes['current-code'].textContent, '287082');
  assert.equal(page.nodes['finish-setup'].disabled, true);
  await page.fire('finish-setup');
  assert.equal(page.store.enabled, false);
  await confirm(page);
  assert.equal(page.store.enabled, true);
  assert.equal(page.store.setup_complete, true);
  assert.equal(page.nodes['step-3'].hidden, false);
  assert.equal(page.nodes['ready-email'].textContent, 'you@purdue.edu');
});
test('six-digit codes and Microsoft app activation links get specific errors', async () => {
  const page = await setup();
  await account(page);
  for (const [value, pattern] of [['123456', /verification code/], ['https://mobileappcommunicator.auth.microsoft.com/activatev2/example', /different authenticator app/], ['bad-key!', /secret key/]]) {
    page.nodes.totp_uri.value = value;
    await page.fire('authenticator-form', 'submit');
    assert.match(page.nodes['key-error'].textContent, pattern);
    assert.equal(page.store.totp_uri, '');
    assert.equal(page.store.enabled, false);
  }
});
test('code rolls over automatically and copy uses the refreshed code', async () => {
  const page = await setup();
  await enrollment(page);
  assert.equal(page.nodes.countdown.textContent, 'New code in 1 second.');
  page.setTime(60_000);
  page.timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  await page.fire('copy-code');
  assert.equal(page.nodes['current-code'].textContent, '359152');
  assert.equal(page.nodes.countdown.textContent, 'New code in 30 seconds.');
  assert.deepEqual(page.copied, ['359152']);
});
test('changing the key invalidates code preview and enrollment confirmation', async () => {
  const page = await setup();
  await enrollment(page);
  page.nodes['enrollment-confirmed'].checked = true;
  await page.fire('enrollment-confirmed', 'change');
  page.nodes.totp_uri.value = 'NEW INVALID KEY';
  await page.fire('totp_uri', 'input');
  assert.equal(page.nodes['finish-setup'].disabled, true);
  assert.equal(page.nodes['current-code'].textContent, '');
  await page.fire('finish-setup');
  assert.equal(page.store.enabled, false);
});
test('switching the account clears the previous account authenticator', async () => {
  const page = await setup({ email: 'old@purdue.edu', password: 'test', totp_uri: uri, setup_complete: true, enabled: true });
  await page.fire('edit-setup');
  assert.equal(page.store.enabled, false);
  await account(page, 'new@purdue.edu');
  assert.equal(page.store.totp_uri, '');
  assert.equal(page.store.setup_complete, false);
  assert.equal(page.nodes['verification'].hidden, true);
});
test('storage failure keeps the user on the current step with a retry message', async () => {
  const page = await setup();
  page.failSave(true);
  await account(page);
  assert.equal(page.store.email, undefined);
  assert.equal(page.nodes['step-1'].hidden, false);
  assert.match(page.nodes.status.textContent, /Could not save/);
  page.failSave(false);
  await account(page);
  assert.equal(page.nodes['step-2'].hidden, false);
});
test('clearing settings requires the explicit second action', async () => {
  const page = await setup({ email: 'you@purdue.edu', password: 'test', totp_uri: uri, setup_complete: true, enabled: true });
  await page.fire('clear');
  assert.equal(page.store.email, 'you@purdue.edu');
  await page.fire('cancel-clear');
  assert.equal(page.store.email, 'you@purdue.edu');
  await page.fire('confirm-clear');
  assert.deepEqual(page.store, {});
  assert.equal(page.nodes['step-1'].hidden, false);
});
test('partial setup resumes enrollment without claiming it is complete', async () => {
  const page = await setup({ email: 'you@purdue.edu', password: 'test', totp_uri: uri, setup_complete: false, enabled: false });
  assert.equal(page.nodes['step-2'].hidden, false);
  assert.equal(page.nodes['enrollment-confirmed'].checked, false);
  assert.equal(page.nodes['finish-setup'].disabled, true);
  assert.equal(page.store.enabled, false);
});

test('setup codes match public vectors and the independent reference', async () => {
  const page = await setup();
  const { generateTotp: reference } = await import('./reference-totp.mjs');
  assert.equal(await page.api.generateTotp(`${uri}&digits=8`, 59_000), '94287082');
  for (const algorithm of ['SHA1', 'SHA256', 'SHA512']) {
    const variation = `${uri}&algorithm=${algorithm}&digits=7&period=60`;
    assert.equal(await page.api.generateTotp(variation, 1234567890000), reference(variation, 1234567890000));
  }
});

test('new popup shows Start setup and hides unavailable pause/retry controls', async () => {
  const handlers = {};
  const nodes = {};
  for (const [, id] of read('popup.html').matchAll(/id="([^"]+)"/g)) nodes[id] = {
    hidden: false, textContent: '', classList: { toggle() {} },
    addEventListener(_type, fn) { handlers[id] = fn; },
  };
  let opened = false;
  const context = vm.createContext({
    URL, Date,
    document: { querySelector: selector => nodes[selector.slice(1)] },
    chrome: { storage: { local: { async get() { return {}; } }, onChanged: { addListener() {} } }, runtime: { openOptionsPage() { opened = true; } } },
  });
  vm.runInContext(core + '\n' + read('popup.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.settings.textContent, 'Start setup');
  assert.equal(nodes.controls.hidden, true);
  assert.equal(nodes.retry.hidden, true);
  assert.equal(nodes.resume.hidden, true);
  await handlers.settings();
  assert.equal(opened, true);
});
