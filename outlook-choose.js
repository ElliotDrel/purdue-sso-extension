(async () => {
  let destination;
  try { destination = decodeURIComponent(location.hash.slice(1)); } catch { /* Validate below. */ }
  if (!OutlookAccount.appUrl(destination)) {
    document.querySelector('#status').textContent = 'This Outlook destination is invalid.';
    document.querySelector('#account-form').hidden = true;
    return;
  }
  const saved = await chrome.storage.local.get(['outlook_last', 'email']);
  document.querySelector('#outlook-email').value = OutlookAccount.resolve(saved);
  document.querySelector('#account-form').addEventListener('submit', async event => {
    event.preventDefault();
    const account = OutlookAccount.email(document.querySelector('#outlook-email').value);
    if (!account) return;
    // Resolving an explicit user choice bypasses Ask without changing the preference.
    try {
      const tab = await chrome.tabs.getCurrent();
      const result = await chrome.runtime.sendMessage({ type: 'outlook-choice', tabId: tab.id, account });
      if (!result?.ok) throw Error('Choice not recorded');
      const plan = OutlookAccount.plan(destination, {}, account);
      location.replace(plan.target);
    } catch { document.querySelector('#status').textContent = 'Could not select the account. Try again.'; }
  });
})().catch(() => { document.querySelector('#status').textContent = 'Could not load account settings. Reload to try again.'; });
