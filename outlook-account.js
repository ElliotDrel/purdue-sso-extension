// Account selection is independent of Purdue credential enrollment.
globalThis.OutlookAccount = (() => {
  const hosts = ['outlook.office.com', 'outlook.cloud.microsoft'];
  function email(value) {
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return text.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(text) ? text : '';
  }
  function appUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && hosts.includes(url.hostname) && !url.port && !url.username && !url.password
        && /^\/(?:$|(?:mail|calendar|people)(?:\/|$))/.test(url.pathname) ? url : null;
    } catch { return null; }
  }
  function mailboxEmail(text) {
    // Outlook renders icon-font glyphs alongside the address inside the treeitem.
    // This helper is used only on that mailbox-root element, never the message body.
    const addresses = typeof text === 'string'
      ? text.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [] : [];
    return addresses.length === 1 ? email(addresses[0]) : '';
  }
  function explicit(url) {
    const hint = url.searchParams.get('login_hint') || url.searchParams.get('auth');
    const mailbox = url.pathname.match(/^\/(?:mail|calendar|people)\/([^/]+)/)?.[1] || '';
    let pathEmail = '';
    try { pathEmail = email(decodeURIComponent(mailbox)); } catch { /* Invalid paths are left to Outlook. */ }
    // A path may name a shared mailbox, not an account with sign-in credentials.
    return { account: email(hint),
      // Indexed/shared mailbox links already choose a context. Do not reinterpret it.
      fixed: url.searchParams.has('login_hint') || url.searchParams.has('auth') || !!pathEmail || /^\d+$/.test(mailbox) };
  }
  function resolve(saved, specified = '') {
    if (email(specified)) return email(specified);
    if (saved.outlook_mode === 'ask') return '';
    return saved.outlook_mode === 'preferred' ? email(saved.outlook_preferred)
      : email(saved.outlook_last?.email) || email(saved.email);
  }
  function plan(value, saved, userChoice = '') {
    const url = appUrl(value);
    if (!url) return null;
    const selection = explicit(url);
    const chosen = email(userChoice);
    const account = chosen || resolve(saved, selection.account);
    const ask = !chosen && !selection.fixed && !account;
    // Append instead of reserializing existing query parameters (%20, +, IDs).
    let target = value.replace('https://outlook.office.com/', 'https://outlook.cloud.microsoft/');
    if (chosen && url.searchParams.has('login_hint')) {
      target = target.replace(/([?&]login_hint=)[^&#]*/g, '$1' + encodeURIComponent(chosen));
    } else if ((chosen || !selection.fixed) && account) {
      const hashAt = target.indexOf('#');
      const base = hashAt < 0 ? target : target.slice(0, hashAt);
      const hash = hashAt < 0 ? '' : target.slice(hashAt);
      target = base + (base.includes('?') ? '&' : '?') + 'login_hint=' + encodeURIComponent(account) + hash;
    }
    return { target, account: chosen || (selection.fixed ? selection.account : account), ask };
  }
  function rules(saved) {
    const account = resolve(saved);
    if (!account) return [];
    const app = '^https://outlook\\.(office\\.com|cloud\\.microsoft)/((mail|calendar|people)(/[^?#]*)?)?([?#].*)?$';
    const fixed = '/((mail|calendar|people)/([0-9]+|[^/?#]*(@|%40)[^/?#]*)(/|[?#]|$)|((mail|calendar|people)(/[^?#]*)?)?\\?([^#]*&)?(login_hint|auth)=)';
    const condition = regexFilter => ({ regexFilter, isUrlFilterCaseSensitive: true, resourceTypes: ['main_frame'] });
    return [
      { id: 100, priority: 2, condition: condition(app), action: { type: 'redirect', redirect: { transform: {
        host: 'outlook.cloud.microsoft', queryTransform: { addOrReplaceParams: [{ key: 'login_hint', value: account }] },
      } } } },
      { id: 101, priority: 3, condition: condition('^https://outlook\\.office\\.com' + fixed),
        action: { type: 'redirect', redirect: { transform: { host: 'outlook.cloud.microsoft' } } } },
      { id: 102, priority: 3, condition: condition('^https://outlook\\.cloud\\.microsoft' + fixed), action: { type: 'allow' } },
    ];
  }
  return { email, mailboxEmail, appUrl, explicit, resolve, plan, rules };
})();
