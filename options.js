const { normalizeEmail, normalizeEnrollment, validTotpUri, generateTotp, configured } = PurdueSetup;
const fields = ['email', 'password', 'totp_uri', 'campus', 'enabled', 'setup_complete'];
const $ = id => document.querySelector(`#${id}`);
let saved = await chrome.storage.local.get([...fields, 'manual_pause_until']);
let step = 1;
let currentUri = null;
let renderedCounter = -1;
let codeBusy = false;
let codeTask = null;
let codeRevision = 0;
let saving = false;

function fieldError(id, message) {
  $(id === 'email' ? 'email-error' : id === 'password' ? 'password-error' : 'key-error').textContent = message;
  $(id).setAttribute('aria-invalid', message ? 'true' : 'false');
}
function showStep(next, focus = true) {
  step = next;
  for (let index = 1; index <= 3; index++) {
    $(`step-${index}`).hidden = index !== next;
    const progress = $(`progress-${index}`);
    if (index === next) progress.setAttribute('aria-current', 'step');
    else progress.removeAttribute('aria-current');
    progress.classList.toggle('completed', index < next);
  }
  $('enrollment-email').textContent = saved.email || '';
  $('ready-email').textContent = saved.email || '';
  $('enabled').checked = saved.enabled === true;
  const paused = saved.manual_pause_until === -1 || saved.manual_pause_until > Date.now();
  $('automation-state').textContent = !saved.enabled ? 'Automatic sign-in is off.'
    : paused ? 'Automatic sign-in is paused. Resume it from the extension popup.' : 'Automatic sign-in is on.';
  $('automation-dot').classList.toggle('off', !saved.enabled || paused);
  if (focus) $(next === 1 ? 'account-heading' : next === 2 ? 'authenticator-heading' : 'ready-heading').focus();
}
function resetCode() {
  codeRevision++;
  currentUri = null;
  renderedCounter = -1;
  $('verification').hidden = true;
  $('current-code').textContent = '';
  $('countdown').textContent = '';
  $('enrollment-confirmed').checked = false;
  $('finish-setup').disabled = true;
  $('verification-status').textContent = '';
}
async function refreshCode(force = false) {
  if (!currentUri || step !== 2) return;
  if (codeBusy) {
    try { await codeTask; } catch { /* The generating call displays the error. */ }
    return refreshCode(force);
  }
  const uri = currentUri;
  const revision = codeRevision;
  const period = Number(new URL(uri).searchParams.get('period') || 30);
  const now = Date.now();
  const counter = Math.floor(now / 1000 / period);
  const remaining = Math.ceil(period - (now / 1000 % period));
  $('countdown').textContent = `New code in ${remaining} ${remaining === 1 ? 'second' : 'seconds'}.`;
  $('countdown').classList.toggle('expiring', remaining <= 5);
  if (!force && counter === renderedCounter) return;
  codeBusy = true;
  try {
    codeTask = generateTotp(uri, now);
    const code = await codeTask;
    if (revision !== codeRevision || currentUri !== uri || step !== 2) return;
    $('current-code').textContent = code;
    renderedCounter = counter;
  } catch {
    if (revision === codeRevision) $('verification-status').textContent = 'Could not generate a code. Check the setup key and save it again.';
  } finally { codeBusy = false; codeTask = null; }
}
async function save(values) {
  await chrome.storage.local.set(values);
  saved = { ...saved, ...values };
}
function reportSaveError() {
  $('status').textContent = 'Could not save your settings. Try again before continuing.';
}

$('email').value = saved.email || '';
$('password').value = saved.password || '';
$('campus').value = saved.campus || 'Purdue West Lafayette / Indianapolis';
$('totp_uri').value = saved.totp_uri || '';
showStep(configured(saved) ? 3 : normalizeEmail(saved.email || '') && saved.password ? 2 : 1, false);
if (step === 2 && validTotpUri(saved.totp_uri || '')) {
  currentUri = saved.totp_uri;
  $('verification').hidden = false;
  await refreshCode(true);
}
const codeTimer = setInterval(() => { void refreshCode(); }, 1000);
window.addEventListener('pagehide', () => clearInterval(codeTimer));

$('account-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  const email = normalizeEmail($('email').value);
  const password = $('password').value;
  fieldError('email', email ? '' : 'Enter your full Purdue email address, including @purdue.edu.');
  fieldError('password', password ? '' : 'Enter your Purdue password.');
  if (!email || !password) { $(email ? 'password' : 'email').focus(); return; }
  saving = true;
  try {
    const uri = email === saved.email ? saved.totp_uri || '' : '';
    await save({ email, password, campus: $('campus').value, totp_uri: uri, enabled: false, setup_complete: false });
    $('email').value = email;
    $('totp_uri').value = uri;
    resetCode();
    $('status').textContent = '';
    showStep(2);
    if (validTotpUri(uri)) { currentUri = uri; $('verification').hidden = false; await refreshCode(true); }
  } catch { reportSaveError(); }
  finally { saving = false; }
});
$('authenticator-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  const result = normalizeEnrollment($('totp_uri').value, saved.email);
  fieldError('totp_uri', result.error || '');
  if (result.error) { $('totp_uri').focus(); return; }
  saving = true;
  try {
    await save({ totp_uri: result.uri, enabled: false, setup_complete: false });
    resetCode();
    currentUri = result.uri;
    $('verification').hidden = false;
    $('status').textContent = '';
    await refreshCode(true);
  } catch { reportSaveError(); }
  finally { saving = false; }
});
$('totp_uri').addEventListener('input', () => { resetCode(); fieldError('totp_uri', ''); });
$('enrollment-confirmed').addEventListener('change', () => {
  $('finish-setup').disabled = !($('enrollment-confirmed').checked && currentUri && $('current-code').textContent);
});
$('finish-setup').addEventListener('click', async () => {
  if (saving || !$('enrollment-confirmed').checked || !currentUri || !$('current-code').textContent) return;
  const result = normalizeEnrollment($('totp_uri').value, saved.email);
  if (result.uri !== currentUri || saved.totp_uri !== currentUri || !normalizeEmail(saved.email || '') || !saved.password) return;
  saving = true;
  try {
    await save({ enabled: true, setup_complete: true, manual_pause_until: 0 });
    resetCode();
    $('status').textContent = 'Setup complete. Open a Purdue service to try automatic sign-in.';
    showStep(3);
  } catch { reportSaveError(); }
  finally { saving = false; }
});
$('copy-code').addEventListener('click', async () => {
  try {
    await refreshCode(true);
    const code = $('current-code').textContent;
    if (!currentUri || !code) return;
    await navigator.clipboard.writeText(code);
    $('verification-status').textContent = 'Code copied. Paste it into Microsoft’s verification field.';
  } catch { $('verification-status').textContent = 'Could not copy. Select the code above and copy it manually.'; }
});
$('back-account').addEventListener('click', () => { $('status').textContent = ''; showStep(1); });
$('edit-setup').addEventListener('click', async () => {
  try {
    await save({ enabled: false, setup_complete: false });
    resetCode();
    $('status').textContent = 'Automatic sign-in is off while you update setup.';
    showStep(1);
  } catch { reportSaveError(); }
});
$('enabled').addEventListener('change', async () => {
  if (!configured(saved)) { $('enabled').checked = false; return; }
  try {
    await save({ enabled: $('enabled').checked, ...($('enabled').checked ? { manual_pause_until: 0 } : {}) });
    showStep(3, false);
  }
  catch { $('enabled').checked = saved.enabled === true; reportSaveError(); }
});
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === 'local' && changes.manual_pause_until) {
    saved.manual_pause_until = changes.manual_pause_until.newValue;
    if (step === 3) showStep(3, false);
  }
});
$('toggle-password').addEventListener('click', () => {
  const show = $('password').type === 'password';
  $('password').type = show ? 'text' : 'password';
  $('toggle-password').textContent = show ? 'Hide' : 'Show';
  $('toggle-password').setAttribute('aria-pressed', String(show));
});
$('clear').addEventListener('click', () => { $('clear-confirmation').hidden = false; });
$('cancel-clear').addEventListener('click', () => { $('clear-confirmation').hidden = true; });
$('confirm-clear').addEventListener('click', async () => {
  try {
    await chrome.storage.local.remove([...fields, 'manual_pause_until']);
    saved = {};
    for (const id of ['email', 'password', 'totp_uri']) $(id).value = '';
    $('password').type = 'password';
    $('toggle-password').textContent = 'Show';
    $('toggle-password').setAttribute('aria-pressed', 'false');
    $('campus').value = 'Purdue West Lafayette / Indianapolis';
    $('clear-confirmation').hidden = true;
    resetCode();
    $('status').textContent = 'Saved settings cleared. Reload any open sign-in pages.';
    showStep(1);
  } catch { $('status').textContent = 'Could not clear your settings. Try again.'; }
});
