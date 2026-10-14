import { useEffect, useRef, useState } from 'react';

import { nextPollDelay, retryAfterMsFromError } from '../utils/pollBackoff';

const DEFAULT_TIMEOUT_MS = 30000;

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * Run `fn` now, then again on a self-scheduling timer: every 5s while it
 * succeeds, doubling (with jitter, up to 60s) while it throws. A thrown Apollo
 * error carrying a Retry-After header stretches the wait to that hint.
 *
 * Polling pauses while the tab is hidden and fires immediately when it becomes
 * visible again. The first call always runs, even in a background tab, so a
 * page opened in a new tab is ready when the viewer switches to it.
 *
 * A manual timer instead of Apollo's `pollInterval`: Apollo's interval is fixed
 * and keeps firing at the same rate through errors, and swapping it with
 * startPolling/stopPolling would still leave error handling in Apollo's hands.
 * Here the next call is only scheduled after the previous one settles, so calls
 * never overlap and a slow backend slows the loop down with it.
 *
 * `fn` is read through a ref, so a new identity on every render (an inline
 * function, or one closing over unmemoized context) never restarts the loop.
 *
 * @param {() => Promise<unknown>} fn  resolve = success, throw/reject = failure
 * @param {object} [opts]
 * @param {boolean} [opts.enabled=true]  false stops the loop; true (re)starts it with an immediate call
 * @param {number} [opts.timeoutMs=30000]  a call that hasn't settled by then counts as a failure, so a
 *   hung request (fetch has no timeout of its own) can't stall the loop and strand the page
 * @param {() => number} [opts.random]  injectable for tests
 * @returns {{ failures: number }} consecutive failures; 0 once a call succeeds
 */
const useBackoffPoll = (fn, { enabled = true, random = Math.random, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  const fnRef = useRef(fn);
  const timeoutMsRef = useRef(timeoutMs);
  const randomRef = useRef(random);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    randomRef.current = random;
  }, [random]);

  useEffect(() => {
    timeoutMsRef.current = timeoutMs;
  }, [timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    let inFlight = false;
    let failureCount = 0;

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // Declared before `run` uses it; assigned below so the two can reference
    // each other without tripping no-use-before-define.
    let schedule = () => {};

    const run = async () => {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;
      let retryAfterMs = null;
      let deadline = null;
      try {
        await Promise.race([
          Promise.resolve().then(() => fnRef.current()),
          new Promise((_, reject) => {
            deadline = setTimeout(() => reject(new Error('poll timed out')), timeoutMsRef.current);
          })
        ]);
        failureCount = 0;
      } catch (err) {
        failureCount += 1;
        retryAfterMs = retryAfterMsFromError(err);
      }
      clearTimeout(deadline);
      inFlight = false;
      if (cancelled) {
        return;
      }
      setFailures(failureCount);
      // Hidden now: leave it to the visibilitychange handler to resume.
      if (!isHidden()) {
        schedule(nextPollDelay(failureCount, { retryAfterMs, random: randomRef.current }));
      }
    };

    schedule = (delay) => {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        if (!isHidden()) {
          run();
        }
      }, delay);
    };

    const onVisibilityChange = () => {
      if (isHidden()) {
        clearTimer();
        return;
      }
      // A call still in flight schedules the next one when it settles.
      if (inFlight) {
        return;
      }
      clearTimer();
      run();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    run();

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);

  return { failures };
};

export default useBackoffPoll;
