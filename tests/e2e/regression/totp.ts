import { createHmac } from 'node:crypto';

// Minimal RFC 6238 TOTP for e2e specs — plays the role of the user's
// authenticator app against the base32 secret the enrollment screen shows.
// Parameters mirror the backend (TotpUtil): HMAC-SHA1, 6 digits, 30s step.
// Kept dependency-free on purpose; ~30 lines beats an npm package here.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Decode = (encoded: string): Buffer => {
  const clean = encoded.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`invalid base32 character: ${char}`);
    }
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
};

/**
 * The 6-digit code an authenticator app would display at `atMillis`
 * (defaults to now). Specs that sign in right after confirming enrollment
 * should pass `Date.now() + 30_000`: the backend records the enrollment
 * code's time step as consumed (replay protection), and the NEXT step's
 * code is still inside the server's ±1-step acceptance window.
 */
export const totpCode = (base32Secret: string, atMillis: number = Date.now()): string => {
  const key = base32Decode(base32Secret);
  const step = Math.floor(atMillis / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
};
