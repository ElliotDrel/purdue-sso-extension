const $ = id => document.querySelector(`#${id}`);
const status = $('status');
let ready = false;
async function showPauseState() {
  const saved = await chrome.storage.local.get(['manual_pause_until', 'enabled', 'email', 'password', 'totp_uri', 'setup_complete']);
  ready = PurdueSetup.configured(saved);
  const until = saved.manual_pause_until || 0;
  const paused = until === -1 || until > Date.now();
  const on = ready && saved.enabled && !paused;
  $('setup-intro').hidden = ready;
  $('controls').hidden = !ready;
  $('account-label').hidden = !ready;
  $('account-label').textContent = saved.email || '';
  $('retry').hidden = !on;
  $('settings').textContent = ready ? 'Settings' : saved.email ? 'Finish setup' : 'Start setup';
  $('settings').className = ready ? 'text-button' : 'primary';
  $('state-dot').classList.toggle('off', !on);
  $('pause-controls').hidden = !on;
  $('resume').hidden = !ready || on;
  $('resume').textContent = saved.enabled ? 'Resume automatic sign-in' : 'Turn on automatic sign-in';
  $('pause-state').textContent = !ready ? 'Setup is not complete.' : !saved.enabled ? 'Automatic sign-in is off.'
    : paused ? until === -1 ? 'Paused until you resume.'
      : `Paused until ${new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
    : 'Automatic sign-in is on.';
}
$('pause').addEventListener('click', async () => {
  if (!ready) return;
  const choice = $('pause-length').value;
  const until = choice === 'until-resumed' ? -1 : Date.now() + Number(choice) * 60_000;
  try {
    await chrome.storage.local.set({ manual_pause_until: until });
    status.textContent = 'Choose your account on the website while sign-in is paused.';
    await showPauseState();
  } catch { status.textContent = 'Could not pause sign-in. Try again.'; }
});
$('resume').addEventListener('click', async () => {
  const saved = await chrome.storage.local.get(['email', 'password', 'totp_uri', 'setup_complete']);
  if (!PurdueSetup.configured(saved)) { await showPauseState(); return; }
  try {
    await chrome.storage.local.set({ enabled: true });
    await chrome.storage.local.remove('manual_pause_until');
    status.textContent = 'Automatic sign-in is on. Reload an open sign-in page if needed.';
    await showPauseState();
  } catch { status.textContent = 'Could not resume sign-in. Try again.'; }
});
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('retry').addEventListener('click', async () => {
  if (!ready) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:sso|idp)\.purdue\.edu\/|^https:\/\/login\.microsoftonline\.com\/|^https:\/\/purdue\.brightspace\.com\//.test(tab.url || '')) {
    status.textContent = 'Open a Purdue sign-in page first.';
    return;
  }
  try { await chrome.tabs.sendMessage(tab.id, 'retry-sign-in'); status.textContent = 'Retrying sign-in.'; }
  catch { status.textContent = 'Reload this tab to retry sign-in.'; }
});
chrome.storage.onChanged.addListener(() => { void showPauseState(); });
void showPauseState();
