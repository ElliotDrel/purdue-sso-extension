const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const resources = manifest.declarative_net_request.rule_resources;
const rules = JSON.parse(fs.readFileSync(path.join(root, resources[0].path), 'utf8'));
const rule = rules[0];
const matches = url => new RegExp(rule.condition.regexFilter).test(url);

test('Outlook app navigation shares one hostname and only top-level navigation is changed', () => {
  assert.deepEqual(resources, [{ id: 'outlook_compose', enabled: true, path: 'outlook-rules.json' }]);
  assert.equal(rules.length, 1);
  assert.equal(rule.id, 1);
  assert.equal(rule.priority, 1);
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
  assert.equal(rule.condition.isUrlFilterCaseSensitive, true);
  assert.deepEqual(rule.action, {
    type: 'redirect', redirect: { transform: { host: 'outlook.cloud.microsoft' } },
  });
});

test('plain, trailing-slash, and encoded compose links match without requiring a particular source app', () => {
  for (const suffix of ['', '/', '?to=test%40purdue.edu', '/?subject=Hello%20there', '#fragment']) {
    assert.equal(matches('https://outlook.office.com/mail/deeplink/compose' + suffix), true);
  }
  assert.equal(rule.condition.initiatorDomains, undefined);
});

test('host-only transform preserves encoded message contents, explicit account hints, and fragments', () => {
  const query = '?to=test%40purdue.edu&cc=other%40purdue.edu&subject=A%20B%2BC'
    + '&body=Line%201%0A%26%3F%23%25%2B+%F0%9F%91%8B&login_hint=test%40purdue.edu#draft';
  const original = 'https://outlook.office.com/mail/deeplink/compose' + query;
  assert.equal(matches(original), true);
  // Model the declared URL transform; Chrome integration is verified separately.
  const target = new URL(original);
  target.hostname = rule.action.redirect.transform.host;
  assert.equal(target.href, 'https://outlook.cloud.microsoft/mail/deeplink/compose' + query);
  assert.equal(matches(target.href), false, 'The destination cannot loop');
});

test('read links preserve opaque message IDs, query parameters, and fragments', () => {
  for (const id of ['AAkALgSyntheticOpaque_Message-Id000',
    'synthetic%2Fid%2Bwith%3Dpadding', 'synthetic/id+with=padding']) {
    for (const suffix of ['', '/', '?login_hint=test%40purdue.edu&x=%2B%20#message']) {
      const source = 'https://outlook.office.com/mail/deeplink/read/' + id + suffix;
      assert.equal(matches(source), true, source);
      const target = new URL(source);
      target.hostname = rule.action.redirect.transform.host;
      assert.equal(target.href, source.replace('outlook.office.com', 'outlook.cloud.microsoft'));
      assert.equal(matches(target.href), false, 'Reading links cannot loop');
    }
  }
});

test('all app routes share the canonical host without enumerating deep-link actions', () => {
  for (const route of ['', '?login_hint=test%40purdue.edu', 'mail', 'mail/', 'mail/inbox',
    'mail/0/deeplink/read/synthetic%2Fid', 'mail/test%40purdue.edu/inbox',
    'mail/deeplink/future-action/opaque%2Bid?x=%20%2B#part',
    'mail/deeplink/compose/item', 'calendar', 'calendar/view/week',
    'calendar/deeplink/compose?subject=Test', 'calendar/item/synthetic-id',
    'people/', 'people/0/contact/synthetic-id']) {
    const source = 'https://outlook.office.com/' + route;
    assert.equal(matches(source), true, source);
    const target = new URL(source);
    target.hostname = rule.action.redirect.transform.host;
    assert.equal(target.href, source.replace('outlook.office.com', 'outlook.cloud.microsoft'));
    assert.equal(matches(target.href), false);
  }
});

test('auth callbacks, APIs, legacy OWA handlers, lookalikes, embedded URLs, and HTTP are untouched', () => {
  for (const url of [
    'https://outlook.office.com/owa/?code=synthetic&state=synthetic',
    'https://outlook.office.com/owa/auth/logon.aspx',
    'https://outlook.office.com/oauth2/callback',
    'https://outlook.office.com/api/v2.0/me',
    'https://outlook.office.com/mailSomething/inbox',
    'https://outlook.office.com/calendarSomething/',
    'https://outlook.office.com.evil.example/mail/deeplink/compose',
    'https://example.com/?url=https://outlook.office.com/mail/deeplink/compose',
    'https://outlook.cloud.microsoft/mail/deeplink/compose',
    'http://outlook.office.com/mail/deeplink/compose',
    'https://outlook.office.com.evil.example/mail/deeplink/read/id',
    'https://outlook.cloud.microsoft/mail/deeplink/read/id',
  ]) assert.equal(matches(url), false, url);
});
