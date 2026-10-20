(async () => {
  const mode = document.querySelector('#outlook-mode');
  const preferred = document.querySelector('#outlook-preferred');
  const field = document.querySelector('#outlook-preferred-field');
  const status = document.querySelector('#outlook-status');
  const saved = await chrome.storage.local.get(['outlook_mode', 'outlook_preferred', 'outlook_last']);
  mode.value = ['ask', 'preferred'].includes(saved.outlook_mode) ? saved.outlook_mode : 'last';
  preferred.value = saved.outlook_preferred || '';
  field.hidden = mode.value !== 'preferred';
  status.textContent = saved.outlook_last?.email ? `Last confirmed: ${saved.outlook_last.email}` : 'Your next confirmed mailbox will be remembered.';
  const save = async () => {
    field.hidden = mode.value !== 'preferred';
    const account = OutlookAccount.email(preferred.value);
    if (mode.value === 'preferred' && !account) {
      status.textContent = 'Enter the full email address to use.';
      return;
    }
    try {
      await chrome.storage.local.set({ outlook_mode: mode.value, outlook_preferred: account });
      status.textContent = 'Saved. Applies to the next Outlook link.';
    } catch { status.textContent = 'Could not save. Try again.'; }
  };
  mode.addEventListener('change', save);
  preferred.addEventListener('change', save);
  preferred.addEventListener('input', save);
})().catch(() => { document.querySelector('#outlook-status').textContent = 'Could not load Outlook settings. Reopen to try again.'; });
