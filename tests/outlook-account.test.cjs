const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const core = vm.createContext({ URL });
vm.runInContext(read('outlook-account.js'), core);
const account = core.OutlookAccount;
const base = 'https://outlook.cloud.microsoft/mail/';

test('one resolver honors explicit choice, last selected, configured fallback, preferred and Ask', () => {
  const saved = { email: 'career@purdue.edu', outlook_last: { email: 'org@example.org' } };
  assert.equal(account.resolve(saved), 'org@example.org');
  assert.equal(account.resolve(saved, 'EXPLICIT@example.net'), 'explicit@example.net');
  assert.equal(account.resolve({ email: saved.email }), saved.email);
  assert.equal(account.resolve({ ...saved, outlook_mode: 'preferred', outlook_preferred: 'other@example.net' }), 'other@example.net');
  assert.equal(account.resolve({ ...saved, outlook_mode: 'ask' }), '');
  assert.equal(account.resolve({ ...saved, outlook_mode: 'ask' }, 'explicit@example.net'), 'explicit@example.net');
  assert.equal(account.resolve({ email: 'invalid' }), '');
});

test('navigation appends account context without altering message encoding or fragments', () => {
  const source = 'https://outlook.office.com/mail/deeplink/compose?body=A%20B+%2B&x=%2f#part';
  const result = account.plan(source, { email: 'career@purdue.edu' });
  assert.equal(result.target, source.replace('outlook.office.com', 'outlook.cloud.microsoft').replace('#part', '&login_hint=career%40purdue.edu#part'));
  assert.equal(account.plan(result.target, { email: 'different@purdue.edu' }).target, result.target, 'No loop or overriding explicit hints');
});

test('explicit and indexed mailbox destinations are never overridden by a preference or Ask', () => {
  for (const suffix of ['?login_hint=explicit%40example.org', '?auth=explicit%40example.org', '0/inbox', 'shared%40example.org/inbox']) {
    const source = base + suffix;
    const plan = account.plan(source, { outlook_mode: 'ask' });
    assert.equal(plan.target, source);
    assert.equal(plan.ask, false);
  }
  assert.equal(account.plan(base, { outlook_mode: 'ask' }).ask, true);
  assert.equal(account.plan(base + 'shared%40example.org/inbox', { email: 'career@purdue.edu' }).account, '',
    'A shared-mailbox destination is not a credential account');
  for (const source of ['https://evil.example/mail/', 'https://outlook.cloud.microsoft.evil.example/mail/',
    'http://outlook.cloud.microsoft/mail/', 'https://outlook.cloud.microsoft/owa/?code=synthetic',
    'https://outlook.cloud.microsoft/api/me']) assert.equal(account.plan(source, {}), null);
});

function worker() {
  const local = { email: 'career@purdue.edu' };
  const session = {};
  const listeners = {};
  let now = 1000;
  const area = store => ({
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, store[key]])); },
    async set(values) { Object.assign(store, values); },
    async remove(key) { delete store[key]; },
  });
  const context = vm.createContext({ URL, Promise, Date: class extends Date { static now() { return now; } },
    chrome: {
      storage: { local: area(local), session: area(session), onChanged: { addListener() {} } },
      declarativeNetRequest: { async updateDynamicRules() {} },
      runtime: { getURL: file => 'chrome-extension://test/' + file, onMessage: { addListener(fn) { listeners.message = fn; } } },
      webNavigation: { onBeforeNavigate: { addListener(fn) { listeners.navigate = fn; } },
        onCommitted: { addListener(fn) { listeners.committed = fn; } } },
      tabs: { async get(id) { return { id, url: 'chrome-extension://test/outlook-choose.html#destination' }; },
        onRemoved: { addListener(fn) { listeners.removed = fn; } } },
    },
  });
  context.importScripts = file => vm.runInContext(read(file), context);
  const start = () => vm.runInContext(read('outlook-background.js').replaceAll('const flowKey', 'var flowKey').replaceAll('const navKey', 'var navKey').replaceAll('const expiry', 'var expiry').replaceAll('let queue', 'var queue'), context);
  start();
  const sender = (tabId = 1, url = base + '?login_hint=org%40example.org', documentId = 'doc1') => ({ tab: { id: tabId }, frameId: 0, url, documentId });
  const send = (type, from = sender(), extra = {}) => {
    if (type === 'outlook-route') listeners.committed({ tabId: from.tab.id, frameId: from.frameId,
      documentId: from.documentId, url: from.url, transitionType: extra.transitionType || 'link' });
    return new Promise(resolve => listeners.message({ type, ...extra }, from, resolve));
  };
  return { local, session, listeners, sender, send, start, advance(ms) { now += ms; } };
}

test('remember only confirmed matching mailbox; same-tab sign-in uses its choice and never credentials', async () => {
  const w = worker();
  await w.send('outlook-route');
  assert.equal(w.local.outlook_last, undefined);
  const auth = w.sender(1, 'https://login.microsoftonline.com/common/login', 'auth1');
  assert.equal((await w.send('outlook-auth', auth)).account, 'org@example.org');
  await w.send('outlook-confirm', undefined, { account: 'wrong@example.org' });
  assert.equal(w.local.outlook_last, undefined);
  await w.send('outlook-confirm', undefined, { account: 'org@example.org' });
  assert.equal(w.local.outlook_last.email, 'org@example.org');
  assert.equal(await w.send('outlook-auth', auth), null, 'Completed flows do not affect later sign-in');
  assert.equal(w.session.outlook_flow_1.password, undefined);
  assert.equal(w.session.outlook_flow_1.url, undefined);
});

test('old tabs, frames, private browsing, expired flows and wrong documents cannot replace last account', async () => {
  const w = worker();
  await w.send('outlook-route');
  w.advance(100);
  const newer = w.sender(2, base + '?login_hint=newer%40example.org', 'doc2');
  await w.send('outlook-route', newer);
  await w.send('outlook-confirm', newer, { account: 'newer@example.org' });
  await w.send('outlook-confirm', undefined, { account: 'org@example.org' });
  assert.equal(w.local.outlook_last.email, 'newer@example.org');
  await w.send('outlook-route', { ...newer, frameId: 1 });
  await w.send('outlook-route', { ...newer, tab: { id: 3, incognito: true } });
  assert.equal(w.session.outlook_flow_3, undefined);
  await w.send('outlook-confirm', { ...newer, documentId: 'old-doc' }, { account: 'org@example.org' });
  assert.equal(w.local.outlook_last.email, 'newer@example.org');
  w.advance(600001);
  assert.equal((await w.send('outlook-auth', w.sender(2, 'https://login.microsoftonline.com/common/login'))).manual, true,
    'Expired Outlook context yields to the user instead of reverting to saved credentials');
});

test('Ask routes to local chooser and suspends saved-account automation; explicitly selected account wins', async () => {
  const w = worker();
  w.local.outlook_mode = 'ask';
  const from = w.sender(1, base);
  assert.match((await w.send('outlook-route', from)).target, /^chrome-extension:\/\/test\/outlook-choose.html#/);
  const auth = w.sender(1, 'https://login.microsoftonline.com/common/login');
  assert.equal((await w.send('outlook-auth', auth)).manual, true);
  await w.send('outlook-select', auth, { account: 'chosen@example.net' });
  const result = await w.send('outlook-route', from);
  assert.match(result.target, /login_hint=chosen%40example.net/);
});

test('session context survives worker restarts and is cleared on unrelated navigation or tab closure', async () => {
  const w = worker();
  await w.send('outlook-route');
  w.start();
  const auth = w.sender(1, 'https://login.microsoftonline.com/common/login');
  assert.equal((await w.send('outlook-auth', auth)).account, 'org@example.org');
  w.listeners.navigate({ tabId: 1, frameId: 0, url: 'https://outlook.office.com/owa/?code=synthetic' });
  assert.equal((await w.send('outlook-auth', auth)).account, 'org@example.org', 'Callback passes context without rewriting it');
  w.listeners.navigate({ tabId: 1, frameId: 0, url: 'https://login.microsoftonline.com/common/authorize?redirect_uri=https%3A%2F%2Fother.example%2Fcallback' });
  assert.equal(await w.send('outlook-auth', auth), null);
  await w.send('outlook-route');
  w.listeners.removed(1);
  assert.equal(await w.send('outlook-auth', auth), null);
});

test('reloads cannot change the remembered account, including after the router adds its hint', async () => {
  const w = worker();
  w.local.outlook_last = { email: 'newer@example.org', selectedAt: 999 };
  const source = w.sender(1, base + '?login_hint=old%40example.org');
  await w.send('outlook-route', source, { transitionType: 'reload' });
  await w.send('outlook-confirm', source, { account: 'old@example.org' });
  assert.equal(w.local.outlook_last.email, 'newer@example.org');
  // A fresh unhinted reload needs a redirect but still must not become a selection.
  const noHint = w.sender(3, base, 'reload1');
  const redirect = await w.send('outlook-route', noHint, { transitionType: 'reload' });
  const redirected = w.sender(3, redirect.target, 'reload2');
  await w.send('outlook-route', redirected);
  assert.equal(w.session.outlook_flow_3.remember, false);
});

test('a new human choice can replace an old hint without touching any other URL contents', async () => {
  const source = base + '?body=A%20B+%2f&login_hint=old%40example.org#part';
  const target = account.plan(source, {}, 'new@example.net');
  assert.equal(target.target, source.replace('old%40example.org', 'new%40example.net'));
  const w = worker();
  await w.send('outlook-route');
  await w.send('outlook-select', w.sender(1, 'https://login.microsoftonline.com/common/login'), { account: 'new@example.net' });
  const result = await w.send('outlook-route');
  assert.match(result.target, /login_hint=new%40example.net/);
});

test('observer ignores message addresses and tab focus; confirms only the mailbox root once', async () => {
  const sent = [];
  let root = null;
  let mutation;
  let disconnected = 0;
  const context = vm.createContext({
    OutlookAccount: account,
    chrome: { runtime: { async sendMessage(message) { sent.push(message); return {}; } } },
    location: { replace() { assert.fail('No navigation expected'); } },
    document: { querySelector(selector) { assert.equal(selector, '[id^="primaryMailboxRoot_"]'); return root; } },
    MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} disconnect() { disconnected++; } },
  });
  await vm.runInContext(read('outlook-page.js'), context);
  assert.equal(sent.length, 1);
  root = { textContent: 'confirmed@example.org' };
  mutation();
  await new Promise(resolve => setImmediate(resolve));
  mutation();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].account, 'confirmed@example.org');
  assert.equal(disconnected, 1);
});

test('popup preference saves only valid full addresses and reports storage failures', async () => {
  const nodes = Object.fromEntries(['outlook-mode', 'outlook-preferred', 'outlook-preferred-field', 'outlook-status']
    .map(id => [id, { value: '', textContent: '', addEventListener(type, fn) { this[type] = fn; } }]));
  let stored = {};
  let fail = false;
  const context = vm.createContext({ OutlookAccount: account,
    document: { querySelector: selector => nodes[selector.slice(1)] },
    chrome: { storage: { local: { async get() { return stored; }, async set(value) {
      if (fail) throw Error('synthetic storage failure'); stored = value;
    } } } },
  });
  await vm.runInContext(read('outlook-popup.js'), context);
  const mode = nodes['outlook-mode'];
  const preferred = nodes['outlook-preferred'];
  assert.equal(mode.value, 'last');
  mode.value = 'preferred';
  preferred.value = 'invalid';
  await mode.change();
  assert.equal(stored.outlook_mode, undefined);
  preferred.value = 'OTHER@example.net';
  await preferred.change();
  assert.equal(stored.outlook_preferred, 'other@example.net');
  fail = true;
  mode.value = 'ask';
  await mode.change();
  assert.match(nodes['outlook-status'].textContent, /Could not save/);
});

test('Microsoft sign-in return keeps this tab choice even when Microsoft drops the original hint', async () => {
  const w = worker();
  w.local.outlook_last = { email: 'old@example.org', selectedAt: 1 };
  await w.send('outlook-route'); // This tab explicitly requests org@example.org.
  w.listeners.navigate({ tabId: 1, frameId: 0, url: 'https://login.microsoftonline.com/common/login' });
  const result = await w.send('outlook-route', w.sender(1, base, 'return'));
  assert.match(result.target, /login_hint=org%40example.org/);
  assert.equal(w.session.outlook_flow_1.started, 1000);
  assert.equal(w.session.outlook_flow_1.remember, true);
});

test('local chooser records a pending choice, not last account, and confirms it after navigation', async () => {
  const w = worker();
  const chooser = { url: 'chrome-extension://test/outlook-choose.html#destination' };
  assert.equal((await w.send('outlook-choice', chooser, { tabId: 1, account: 'chosen@example.net' })).ok, true);
  assert.equal(w.local.outlook_last, undefined);
  const from = w.sender(1, base + '?login_hint=chosen%40example.net', 'chosen-doc');
  await w.send('outlook-route', from);
  await w.send('outlook-confirm', from, { account: 'chosen@example.net' });
  assert.equal(w.local.outlook_last.email, 'chosen@example.net');
  assert.equal(await w.send('outlook-choice', { url: 'https://evil.example/' }, { tabId: 1, account: 'wrong@example.org' }), null);
});

test('pre-network rules select only unqualified Outlook app navigation and do not loop', () => {
  const rules = account.rules({ outlook_last: { email: 'org@example.net' } });
  const winner = url => rules.filter(rule => new RegExp(rule.condition.regexFilter).test(url)).sort((a, b) => b.priority - a.priority)[0];
  assert.equal(winner(base).id, 100);
  assert.equal(winner(base + 'deeplink/read/synthetic-id').id, 100);
  assert.equal(winner(base + '?login_hint=explicit%40example.org').id, 102);
  assert.equal(winner('https://outlook.office.com/mail/?auth=explicit%40example.org').id, 101);
  assert.equal(winner(base + 'shared%40example.org/inbox').id, 102);
  assert.equal(winner(base + '0/inbox').id, 102);
  assert.equal(winner('https://outlook.cloud.microsoft/api/me'), undefined);
  assert.equal(winner('https://outlook.cloud.microsoft/owa/?code=synthetic'), undefined);
  assert.equal(winner('https://outlook.office.com/owa/?login_hint=explicit%40example.org'), undefined);
  assert.equal(winner('https://outlook.office.com/api/me?auth=explicit%40example.org'), undefined);
  assert.equal(winner('https://evil.example/?next=' + base), undefined);
  assert.equal(account.rules({ outlook_mode: 'ask' }).length, 0);
  assert.equal(rules[0].action.redirect.transform.queryTransform.addOrReplaceParams[0].value, 'org@example.net');
});

test('cold HTTP sign-in redirects retain per-tab intent even before a document can run', async () => {
  const w = worker();
  w.local.outlook_last = { email: 'org@example.net' };
  w.listeners.navigate({ tabId: 1, frameId: 0, url: base });
  w.listeners.navigate({ tabId: 1, frameId: 0, url: 'https://login.microsoftonline.com/common/login' });
  const auth = await w.send('outlook-auth', w.sender(1, 'https://login.microsoftonline.com/common/login'));
  assert.equal(auth.account, 'org@example.net');
});
