import { createHmac } from 'node:crypto';

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (const character of value.toUpperCase().replace(/=+$/, "")) {
    const index = alphabet.indexOf(character);
    if (index === -1) throw new Error("TOTP secret is not valid base32");

    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotp(totpUri, now = Date.now()) {
  const config = new URL(totpUri);
  if (config.protocol !== "otpauth:" || config.hostname !== "totp") {
    throw new Error("Expected an otpauth://totp URI");
  }

  const secret = config.searchParams.get("secret");
  const period = Number(config.searchParams.get("period") ?? 30);
  const digits = Number(config.searchParams.get("digits") ?? 6);
  const algorithm = (config.searchParams.get("algorithm") ?? "SHA1").toLowerCase();
  if (!secret || !Number.isInteger(period) || period <= 0 || !Number.isInteger(digits) || digits <= 0) {
    throw new Error("Invalid Purdue TOTP configuration");
  }

  const counter = BigInt(Math.floor(now / 1000 / period));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac(algorithm, decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, "0");
}
