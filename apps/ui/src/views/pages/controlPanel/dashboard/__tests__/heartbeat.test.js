import { describe, expect, it } from 'vitest';

import { HEARTBEAT_FRESH_MS, isHeartbeatFresh } from '../heartbeat';

describe('isHeartbeatFresh', () => {
  const now = 1_800_000_000_000;

  it('is fresh just inside the window and stale at its edge', () => {
    expect(isHeartbeatFresh(now - HEARTBEAT_FRESH_MS + 1, now)).toBe(true);
    expect(isHeartbeatFresh(now - HEARTBEAT_FRESH_MS, now)).toBe(false);
  });

  it('covers the 120s write floor: a 6-minute-old stored beat is still connected', () => {
    expect(isHeartbeatFresh(now - 6 * 60 * 1000, now)).toBe(true);
  });

  it('treats a missing heartbeat as not fresh', () => {
    expect(isHeartbeatFresh(null, now)).toBe(false);
    expect(isHeartbeatFresh(0, now)).toBe(false);
  });
});
