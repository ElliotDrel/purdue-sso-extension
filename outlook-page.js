(async () => {
  const plan = await chrome.runtime.sendMessage({ type: 'outlook-route' });
  if (!plan || plan.error) return; // Storage/runtime failure leaves Outlook's own UI available.
  if (plan.target) { location.replace(plan.target); return; }
  // Read the mailbox root, never addresses found in message bodies or recipients.
  let confirmed = false;
  const confirm = async () => {
    if (confirmed) return;
    const root = document.querySelector('[id^="primaryMailboxRoot_"]');
    const account = OutlookAccount.email(root?.textContent);
    if (!account) return;
    confirmed = true;
    observer.disconnect();
    const result = await chrome.runtime.sendMessage({ type: 'outlook-confirm', account });
    if (result?.mismatch) {
      const notice = document.createElement('div');
      notice.setAttribute('role', 'alert');
      notice.textContent = `Outlook opened ${account} instead of ${result.mismatch}. `;
      const button = document.createElement('button');
      button.textContent = 'Choose account';
      button.addEventListener('click', () => {
        location.replace(chrome.runtime.getURL('outlook-choose.html') + '#' + encodeURIComponent(location.href));
      });
      notice.append(button);
      document.body.prepend(notice);
    }
  };
  const observer = new MutationObserver(() => { void confirm(); });
  observer.observe(document, { childList: true, subtree: true, characterData: true });
  void confirm();
})().catch(() => {});
