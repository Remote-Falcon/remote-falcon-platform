import { createHmac } from 'crypto';

// Minimal RFC 6238 TOTP generator for the two-factor screenshot spec.
// Matches the control-panel's TotpUtil parameters: HMAC-SHA1, 6 digits,
// 30-second period, base32 secret (RFC 4648 alphabet).

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Decode = (input: string): Buffer => {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`totp: invalid base32 character '${char}' in secret`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

export const totpCode = (secret: string, timeMs: number = Date.now()): string => {
  const counter = Math.floor(timeMs / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(counterBuf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, '0');
};

/**
 * Milliseconds until the current 30s TOTP period rolls over. The spec waits
 * out the tail of a period before submitting so the code can't expire
 * between generation and the server-side verify.
 */
export const msLeftInPeriod = (timeMs: number = Date.now()): number =>
  30_000 - (timeMs % 30_000);
