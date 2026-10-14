import { describe, expect, it } from 'vitest';

import { BASE_POLL_MS, MAX_POLL_MS, nextPollDelay, retryAfterMsFromError } from '../pollBackoff';

const noJitter = () => 0.5; // maps to a jitter factor of exactly 1.0

describe('nextPollDelay', () => {
  it('polls at the base interval when nothing has failed', () => {
    expect(nextPollDelay(0, { random: noJitter })).toBe(BASE_POLL_MS);
  });

  it('does not jitter the healthy interval', () => {
    expect(nextPollDelay(0, { random: () => 0 })).toBe(BASE_POLL_MS);
    expect(nextPollDelay(0, { random: () => 0.999 })).toBe(BASE_POLL_MS);
  });

  it('doubles per consecutive failure', () => {
    expect(nextPollDelay(1, { random: noJitter })).toBe(10000);
    expect(nextPollDelay(2, { random: noJitter })).toBe(20000);
    expect(nextPollDelay(3, { random: noJitter })).toBe(40000);
  });

  it('caps at 60s', () => {
    expect(nextPollDelay(4, { random: noJitter })).toBe(MAX_POLL_MS);
    expect(nextPollDelay(50, { random: noJitter })).toBe(MAX_POLL_MS);
  });

  it('applies +/-20% jitter to failure delays', () => {
    expect(nextPollDelay(1, { random: () => 0 })).toBe(8000);
    expect(nextPollDelay(1, { random: () => 1 })).toBe(12000);
    // Jitter applies after the cap, so a capped delay spreads 48s..72s and a
    // fleet of viewers that failed together does not retry together.
    expect(nextPollDelay(10, { random: () => 0 })).toBe(48000);
    expect(nextPollDelay(10, { random: () => 1 })).toBe(72000);
  });

  it('stays inside the jitter band for real randomness', () => {
    for (let i = 0; i < 200; i += 1) {
      const d = nextPollDelay(2);
      expect(d).toBeGreaterThanOrEqual(16000);
      expect(d).toBeLessThanOrEqual(24000);
    }
  });

  it('honors a Retry-After hint longer than the backoff', () => {
    expect(nextPollDelay(1, { random: noJitter, retryAfterMs: 30000 })).toBe(30000);
  });

  it('ignores a Retry-After hint shorter than the backoff', () => {
    expect(nextPollDelay(3, { random: noJitter, retryAfterMs: 1000 })).toBe(40000);
  });

  it('caps a Retry-After hint so a viewer is never parked for minutes', () => {
    expect(nextPollDelay(1, { random: noJitter, retryAfterMs: 600000 })).toBe(MAX_POLL_MS);
  });
});

describe('retryAfterMsFromError', () => {
  const withHeader = (value) => ({
    networkError: { response: { headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? value : null) } } }
  });

  it('reads delta-seconds', () => {
    expect(retryAfterMsFromError(withHeader('15'))).toBe(15000);
  });

  it('reads an HTTP-date', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(retryAfterMsFromError(withHeader('Tue, 13 Oct 2026 12:00:20 GMT'), now)).toBe(20000);
  });

  it('returns null when absent or unparseable', () => {
    expect(retryAfterMsFromError(undefined)).toBeNull();
    expect(retryAfterMsFromError(new Error('boom'))).toBeNull();
    expect(retryAfterMsFromError({ networkError: {} })).toBeNull();
    expect(retryAfterMsFromError(withHeader(null))).toBeNull();
    expect(retryAfterMsFromError(withHeader('soon'))).toBeNull();
  });

  it('never throws on an odd headers object', () => {
    const err = { networkError: { response: { headers: { get: () => { throw new Error('nope'); } } } } };
    expect(retryAfterMsFromError(err)).toBeNull();
  });
});
