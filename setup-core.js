// Shared setup helpers; no credentials are embedded in this file.
globalThis.PurdueSetup = (() => {
  function normalizeEmail(value) {
    const email = value.trim().toLowerCase();
    const local = email.split('@')[0];
    return email.length <= 254 && local.length <= 64
      && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@purdue\.edu$/.test(email)
      && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') ? email : null;
  }
  function validTotpUri(value) {
    try {
      const uri = new URL(value);
      const period = Number(uri.searchParams.get('period') || 30);
      const digits = Number(uri.searchParams.get('digits') || 6);
      const algorithm = (uri.searchParams.get('algorithm') || 'SHA1').toUpperCase();
      return uri.protocol === 'otpauth:' && uri.hostname === 'totp'
        && /^[A-Z2-7]+=*$/i.test(uri.searchParams.get('secret') || '')
        && Number.isInteger(period) && period > 0 && [6, 7, 8].includes(digits)
        && ['SHA1', 'SHA256', 'SHA512'].includes(algorithm);
    } catch { return false; }
  }
  function normalizeEnrollment(value, email) {
    const input = value.trim();
    if (validTotpUri(input)) return { uri: input };
    if (/^\d{6,8}$/.test(input)) return { error: 'That is a verification code. Copy the secret key from “Can’t scan QR Code?” instead.' };
    if (/mobileappcommunicator\.auth\.microsoft\.com/i.test(input)) return { error: 'Go back in Microsoft setup and choose “I want to use a different authenticator app,” then “Can’t scan QR Code?”' };
    const secret = input.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z2-7]{16,}=*$/.test(secret)) return { error: 'Paste the secret key shown by Microsoft, or a valid otpauth://totp/ setup link.' };
    return { uri: `otpauth://totp/${encodeURIComponent(`Purdue:${email}`)}?secret=${secret}&issuer=Purdue` };
  }
  function decodeBase32(value) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = [];
    let bits = 0;
    let buffer = 0;
    for (const character of value.toUpperCase().replace(/=+$/, '')) {
      const index = alphabet.indexOf(character);
      if (index < 0) throw new Error('Invalid authenticator key');
      buffer = (buffer << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >>> bits) & 255);
        buffer &= (1 << bits) - 1;
      }
    }
    return new Uint8Array(bytes);
  }
  async function generateTotp(uri, now = Date.now()) {
    if (!validTotpUri(uri)) throw new Error('Invalid authenticator configuration');
    const url = new URL(uri);
    const period = Number(url.searchParams.get('period') || 30);
    const digits = Number(url.searchParams.get('digits') || 6);
    const hash = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[(url.searchParams.get('algorithm') || 'SHA1').toUpperCase()];
    const counter = new Uint8Array(8);
    new DataView(counter.buffer).setBigUint64(0, BigInt(Math.floor(now / 1000 / period)));
    const key = await crypto.subtle.importKey('raw', decodeBase32(url.searchParams.get('secret')), { name: 'HMAC', hash }, false, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
    const offset = digest[digest.length - 1] & 15;
    const value = new DataView(digest.buffer).getUint32(offset) & 0x7fffffff;
    return String(value % 10 ** digits).padStart(digits, '0');
  }
  function configured(settings) {
    return !!(normalizeEmail(settings.email || '') && settings.password
      && validTotpUri(settings.totp_uri || '') && settings.setup_complete === true);
  }
  return Object.freeze({ normalizeEmail, normalizeEnrollment, validTotpUri, generateTotp, configured });
})();
