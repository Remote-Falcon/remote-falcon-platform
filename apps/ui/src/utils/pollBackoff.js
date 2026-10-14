// Poll cadence for the viewer page's getShow loop (and anything else that
// polls a backend that can be overloaded).
//
// A fixed 5s poll with no backoff turns a slow database into a self-sustaining
// overload: every open viewer keeps hammering at full rate, and every failure
// used to pop an alert that taught viewers to reload, which is worse (a reload
// runs the full init plus a stats write). Doubling on each consecutive failure
// sheds that load, and the jitter stops a crowd of viewers that failed together
// from retrying in lockstep when the backend comes back.

export const BASE_POLL_MS = 5000;
export const MAX_POLL_MS = 60000;
export const JITTER_RATIO = 0.2;

/**
 * Delay before the next poll.
 *
 * @param {number} failures  consecutive failures so far (0 = healthy)
 * @param {object} [opts]
 * @param {number|null} [opts.retryAfterMs]  server hint; used when longer than the backoff, capped at MAX_POLL_MS
 * @param {() => number} [opts.random]  injectable for tests, defaults to Math.random
 * @returns {number} milliseconds
 */
export const nextPollDelay = (failures, { retryAfterMs = null, random = Math.random } = {}) => {
  if (!failures || failures <= 0) {
    return BASE_POLL_MS;
  }
  // 2^failures, clamped before exponentiation so a long outage can't overflow.
  const backoff = Math.min(BASE_POLL_MS * 2 ** Math.min(failures, 16), MAX_POLL_MS);
  const hinted = retryAfterMs && retryAfterMs > backoff ? Math.min(retryAfterMs, MAX_POLL_MS) : backoff;
  const jitter = 1 - JITTER_RATIO + random() * 2 * JITTER_RATIO;
  return Math.round(hinted * jitter);
};

/**
 * Pull a Retry-After hint off an Apollo error, if the transport exposed one.
 * Only the HTTP header is read: it is the one place a 503 would carry it.
 * Note Retry-After is not a CORS-safelisted header, so this only sees it on
 * same-origin calls (the viewer API is) or when the server exposes it.
 *
 * @param {unknown} error
 * @param {number} [now]  injectable for tests
 * @returns {number|null} milliseconds, or null when absent/unparseable
 */
export const retryAfterMsFromError = (error, now = Date.now()) => {
  try {
    const raw = error?.networkError?.response?.headers?.get?.('Retry-After');
    if (raw == null || raw === '') {
      return null;
    }
    const value = String(raw).trim();
    if (/^\d+$/.test(value)) {
      return Number(value) * 1000;
    }
    const at = Date.parse(value);
    if (Number.isNaN(at)) {
      return null;
    }
    return Math.max(0, at - now);
  } catch {
    return null;
  }
};
