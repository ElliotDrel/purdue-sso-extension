const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync(require('node:path').join(__dirname, '../content.js'), 'utf8');

async function picker({ accounts = [], branded = false, paused = false, enabled = true, tenant = false, selected }) {
  const clicks = [];
  const element = (text, name) => ({
    textContent: text, innerText: text, disabled: false,
    getAttribute: () => null, closest: () => null,
    getClientRects: () => [1], click: () => clicks.push(name),
  });
  const tiles = accounts.map(address => element(address, address));
  const another = element('Use another account', 'another');
  const back = element('Back', 'back');
  const identity = selected ? element(selected, 'identity') : null;
  const storage = new Map();
  const context = {
    chrome: { storage: {
      local: { get: async () => ({ username: 'edrel', password: 'test', totp_uri: 'test', enabled, manual_pause_until: paused ? -1 : 0 }) },
      onChanged: { addListener() {} },
    }, runtime: { onMessage: { addListener() {} } } },
    location: { protocol: 'https:', hostname: 'login.microsoftonline.com', pathname: tenant ? '/4130bd39-7c53-419c-b1e5-8758d6d63f21/oauth2/authorize' : '/common/oauth2/authorize' },
    document: {
      body: { innerText: `${selected ? 'Face, fingerprint, PIN or security key' : 'Pick an account'} ${branded ? 'Purdue University' : ''}` },
      querySelector: () => null,
      querySelectorAll: selector => selector.includes('#displayName') ? identity ? [identity] : []
        : selector.includes('#idBtn_Back') ? [back]
        : selector.includes('[data-test-id]') || selector.includes('input[type="submit"]') ? [...tiles, another] : [],
    },
    getComputedStyle: () => ({ visibility: 'visible' }),
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    Date, Set, Number, Array, Object, console,
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
  };
  await vm.runInNewContext(script, context);
  return clicks;
}

test('generic Outlook picker selects edrel even when BuildPurdue is first', async () => {
  assert.deepEqual(await picker({ accounts: ['buildp@purdue.edu', 'EDREL@purdue.edu'] }), ['EDREL@purdue.edu']);
});
test('Purdue picker uses another account when only BuildPurdue is saved', async () => {
  assert.deepEqual(await picker({ accounts: ['buildp@purdue.edu'], branded: true }), ['another']);
});
test('tenant-scoped picker can use another account without branding', async () => {
  assert.deepEqual(await picker({ accounts: ['buildp@purdue.edu'], tenant: true }), ['another']);
});
test('unrelated generic picker is left for manual selection', async () => {
  assert.deepEqual(await picker({ accounts: ['buildp@purdue.edu'] }), []);
});
test('manual pause and disabled automation prevent selection', async () => {
  assert.deepEqual(await picker({ accounts: ['edrel@purdue.edu'], paused: true }), []);
  assert.deepEqual(await picker({ accounts: ['edrel@purdue.edu'], enabled: false }), []);
});
test('remembered BuildPurdue passkey screen goes back on Purdue sign-in', async () => {
  assert.deepEqual(await picker({ selected: 'buildp@purdue.edu', branded: true }), ['back']);
});
test('correct account and unrelated sign-in do not trigger account recovery', async () => {
  assert.deepEqual(await picker({ selected: 'edrel@purdue.edu', branded: true }), []);
  assert.deepEqual(await picker({ selected: 'other@example.com' }), []);
  assert.deepEqual(await picker({ selected: 'buildp@purdue.edu', branded: true, paused: true }), []);
});
