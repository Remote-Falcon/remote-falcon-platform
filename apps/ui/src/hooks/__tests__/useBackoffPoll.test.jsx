import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import useBackoffPoll from '../useBackoffPoll';

const noJitter = () => 0.5;

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

// Let the awaited fn() settle and the hook's post-await bookkeeping run.
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const advance = async (ms) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await flush();
};

describe('useBackoffPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('runs immediately, then every 5s while healthy', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useBackoffPoll(fn, { random: noJitter }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    await advance(4999);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await advance(5000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('backs off 10s, 20s, 40s, 60s on consecutive failures and resets on success', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useBackoffPoll(fn, { random: noJitter }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.failures).toBe(1);

    // 10s gap after the 1st failure
    await advance(9999);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.current.failures).toBe(2);

    // 20s gap
    await advance(19999);
    expect(fn).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(3);

    // 40s gap
    await advance(40000);
    expect(fn).toHaveBeenCalledTimes(4);

    // capped at 60s from here on
    await advance(59999);
    expect(fn).toHaveBeenCalledTimes(4);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(5);

    // recovery resets to the 5s cadence
    fn.mockResolvedValue(undefined);
    await advance(60000);
    expect(fn).toHaveBeenCalledTimes(6);
    expect(result.current.failures).toBe(0);
    await advance(5000);
    expect(fn).toHaveBeenCalledTimes(7);
  });

  it('honors a Retry-After header on the failure', async () => {
    const err = { networkError: { response: { headers: { get: () => '30' } } } };
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue(undefined);
    renderHook(() => useBackoffPoll(fn, { random: noJitter }));
    await flush();
    await advance(29999);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and refetches immediately when visible again', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useBackoffPoll(fn, { random: noJitter }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility('hidden'));
    await advance(120000);
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility('visible'));
    await flush();
    expect(fn).toHaveBeenCalledTimes(2);

    // and the normal cadence resumes from there
    await advance(5000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not double-fire when it becomes visible mid-request', async () => {
    let resolve;
    const fn = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    renderHook(() => useBackoffPoll(fn, { random: noJitter }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility('hidden'));
    await act(async () => setVisibility('visible'));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => resolve());
    await flush();
    await advance(5000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs the first call even when mounted in a hidden tab', async () => {
    setVisibility('hidden');
    const fn = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useBackoffPoll(fn, { random: noJitter }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(30000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled and stops when disabled', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ enabled }) => useBackoffPoll(fn, { enabled, random: noJitter }), {
      initialProps: { enabled: false }
    });
    await advance(20000);
    expect(fn).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    await advance(20000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('always calls the latest fn without restarting the loop', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ fn }) => useBackoffPoll(fn, { random: noJitter }), {
      initialProps: { fn: first }
    });
    await flush();
    rerender({ fn: second });
    await flush();
    // a new fn identity must not trigger an extra immediate call
    expect(second).not.toHaveBeenCalled();
    await advance(5000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('treats a call that never settles as a failure, without overlapping it', async () => {
    const fn = vi.fn(() => new Promise(() => {}));
    const { result } = renderHook(() => useBackoffPoll(fn, { random: noJitter, timeoutMs: 30000 }));
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    await advance(30000);
    expect(result.current.failures).toBe(1);
    // the hung call is still outstanding, so later ticks skip instead of stacking
    await advance(60000);
    expect(fn).toHaveBeenCalledTimes(1);
    // abandoned 2 minutes after it timed out, so a never-settling request
    // cannot strand the page (ticks every 10s: the 150s tick is the first)
    await advance(59999);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('resumes normally once a timed-out call finally settles', async () => {
    let settle;
    const fn = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }))
      .mockResolvedValue(undefined);
    renderHook(() => useBackoffPoll(fn, { random: noJitter, timeoutMs: 30000 }));
    await flush();
    await advance(30000);
    await act(async () => {
      settle();
    });
    await flush();
    // next backoff tick (10s after the timeout) calls again
    await advance(10000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops scheduling after unmount', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useBackoffPoll(fn, { random: noJitter }));
    await flush();
    unmount();
    await advance(60000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
