importScripts('outlook-account.js');
const flowKey = tabId => `outlook_flow_${tabId}`;
const navKey = tabId => `outlook_nav_${tabId}`;
const expiry = 10 * 60_000;
// Serialize updates so a delayed old tab cannot overwrite a newer selection.
let queue = Promise.resolve();
async function syncRules() {
  const saved = await chrome.storage.local.get(['outlook_mode', 'outlook_preferred', 'outlook_last', 'email']);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [100, 101, 102], addRules: OutlookAccount.rules(saved) });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const run = async () => {
    if (message?.type === 'outlook-choice'
      && sender.url?.startsWith(chrome.runtime.getURL('outlook-choose.html') + '#')) {
      const tab = await chrome.tabs.get(message.tabId);
      const account = OutlookAccount.email(message.account);
      if (tab.incognito || tab.url !== sender.url || !account) return null;
      await chrome.storage.session.set({ [flowKey(tab.id)]: {
        account, started: Date.now(), confirmed: false, picked: true,
      } });
      return { ok: true };
    }
    if (!sender.tab || sender.frameId !== 0 || sender.tab.incognito) return null;
    const key = flowKey(sender.tab.id);
    if (message?.type === 'outlook-route') {
      const url = sender.url;
      const saved = await chrome.storage.local.get(['outlook_mode', 'outlook_preferred', 'outlook_last', 'email']);
      const previous = (await chrome.storage.session.get(key))[key];
      const returning = previous?.authenticating && Date.now() - previous.started < expiry
        && !OutlookAccount.explicit(new URL(url)).fixed;
      if (previous?.authenticating && Date.now() - previous.started >= expiry) saved.outlook_mode = 'ask';
      const picked = previous?.picked && Date.now() - previous.started < expiry ? previous.account : '';
      const plan = OutlookAccount.plan(url, saved, picked || (returning ? previous.account : ''));
      if (!plan) return null;
      const navigation = (await chrome.storage.session.get(navKey(sender.tab.id)))[navKey(sender.tab.id)];
      const continued = previous?.redirecting && previous.account === plan.account && Date.now() - previous.started < expiry;
      await chrome.storage.session.set({ [key]: {
        account: plan.account, started: continued || returning ? previous.started : Date.now(),
        remember: previous?.picked || (continued || returning ? previous.remember
          : navigation?.documentId === sender.documentId && navigation.remember),
        documentId: sender.documentId, confirmed: false, redirecting: plan.target !== url,
      } });
      return plan.ask ? { target: chrome.runtime.getURL('outlook-choose.html') + '#' + encodeURIComponent(url) }
        : { target: plan.target === url ? '' : plan.target };
    }
    const flow = (await chrome.storage.session.get(key))[key];
    if (!flow) return null;
    if (Date.now() - flow.started > expiry && message?.type !== 'outlook-select') {
      return message?.type === 'outlook-auth' ? { manual: true } : null;
    }
    if (message?.type === 'outlook-confirm' && OutlookAccount.appUrl(sender.url)
      && flow.documentId === sender.documentId && !flow.confirmed) {
      const account = OutlookAccount.email(message.account);
      if (!account) return null;
      if (flow.account && flow.account !== account) return { mismatch: flow.account };
      const saved = await chrome.storage.local.get('outlook_last');
      if (flow.remember && flow.started >= (saved.outlook_last?.selectedAt || 0)) {
        await chrome.storage.local.set({ outlook_last: { email: account, selectedAt: flow.started } });
        await syncRules();
      }
      await chrome.storage.session.set({ [key]: { ...flow, account, confirmed: true } });
    }
    if (message?.type === 'outlook-auth' && !flow.confirmed && /^https:\/\/(?:login\.microsoftonline\.com|sso\.purdue\.edu|idp\.purdue\.edu)\//.test(sender.url)) {
      return { account: flow.account, manual: !flow.account };
    }
    if (message?.type === 'outlook-select' && /^https:\/\/login\.microsoftonline\.com\//.test(sender.url)) {
      const account = OutlookAccount.email(message.account);
      if (account) await chrome.storage.session.set({ [key]: {
        account, started: Date.now(), confirmed: false, picked: true,
      } });
    }
    return null;
  };
  const job = queue.then(run);
  queue = job.catch(() => {});
  job.then(respond, () => respond({ error: true }));
  return true;
});
// Only carry Outlook intent through Outlook and its authentication chain.
chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0) return;
  const url = new URL(details.url);
  const allowed = (url.protocol === 'https:' && ['outlook.office.com', 'outlook.cloud.microsoft'].includes(url.hostname))
    || (url.protocol === 'https:' && ['login.microsoftonline.com', 'sso.purdue.edu', 'idp.purdue.edu'].includes(url.hostname))
    || details.url.startsWith(chrome.runtime.getURL('outlook-choose.html') + '#');
  const redirect = url.searchParams.get('redirect_uri');
  let unrelatedLogin = false;
  if (url.hostname === 'login.microsoftonline.com' && redirect) {
    try { unrelatedLogin = !['outlook.office.com', 'outlook.cloud.microsoft'].includes(new URL(redirect).hostname); }
    catch { unrelatedLogin = true; }
  }
  if (!allowed || unrelatedLogin) {
    queue = queue.then(() => chrome.storage.session.remove(flowKey(details.tabId))).catch(() => {});
  } else if (OutlookAccount.appUrl(details.url)) {
    // This runs even when Outlook responds with an HTTP redirect and no page script.
    queue = queue.then(async () => {
      const key = flowKey(details.tabId);
      const previous = (await chrome.storage.session.get(key))[key];
      if (previous && !previous.confirmed && Date.now() - previous.started < expiry) return;
      const saved = await chrome.storage.local.get(['outlook_mode', 'outlook_preferred', 'outlook_last', 'email']);
      const plan = OutlookAccount.plan(details.url, saved);
      await chrome.storage.session.set({ [key]: { account: plan.account, started: Date.now(), confirmed: false } });
    }).catch(() => {});
  } else if (['login.microsoftonline.com', 'sso.purdue.edu', 'idp.purdue.edu'].includes(url.hostname)) {
    queue = queue.then(async () => {
      const key = flowKey(details.tabId);
      const flow = (await chrome.storage.session.get(key))[key];
      if (flow && !flow.confirmed) await chrome.storage.session.set({ [key]: { ...flow, authenticating: true } });
    }).catch(() => {});
  }
});
chrome.tabs.onRemoved.addListener(tabId => {
  queue = queue.then(async () => {
    await chrome.storage.session.remove(flowKey(tabId));
    await chrome.storage.session.remove(navKey(tabId));
  }).catch(() => {});
});
chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId !== 0 || !OutlookAccount.appUrl(details.url)) return;
  queue = queue.then(() => chrome.storage.session.set({ [navKey(details.tabId)]: {
    documentId: details.documentId,
    remember: details.transitionType !== 'reload'
      && !details.transitionQualifiers?.some(value => ['forward_back', 'client_redirect'].includes(value)),
  } })).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !['outlook_mode', 'outlook_preferred', 'outlook_last', 'email'].some(key => changes[key])) return;
  queue = queue.then(syncRules).catch(() => {});
});
queue = queue.then(syncRules).catch(() => {});
