import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import useInterval from '../useInterval';

describe('useInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls the callback at each interval tick', () => {
    const callback = vi.fn();
    renderHook(() => useInterval(callback, 1000));

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('does not start an interval when delay is null', () => {
    const callback = vi.fn();
    renderHook(() => useInterval(callback, null));

    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('clears the interval on unmount (no triple-fire after teardown)', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useInterval(callback, 1000));

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(5000);
    // Critical guarantee: after unmount the timer must be cleared.
    // This is the property that prevents the dashboard triple-fire bug
    // (PR #67) from regressing — leaked intervals from prior renders
    // would otherwise stack on top of new ones.
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('resets the interval when the delay changes', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(({ delay }) => useInterval(callback, delay), {
      initialProps: { delay: 1000 },
    });

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    // Change delay — old interval should be cleared, new one started.
    rerender({ delay: 500 });

    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('always invokes the latest callback (no stale closure)', () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(({ cb }) => useInterval(cb, 1000), {
      initialProps: { cb: first },
    });

    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    // Swap callback without changing delay — interval keeps running,
    // but should now call the new callback (savedCallback ref update).
    rerender({ cb: second });

    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not fire when delay transitions from a number to null', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(({ delay }: { delay: number | null }) => useInterval(callback, delay), {
      initialProps: { delay: 1000 as number | null },
    });

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    rerender({ delay: null });
    vi.advanceTimersByTime(10000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
