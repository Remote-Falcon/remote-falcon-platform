import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

import useCoalescedSave from '../useCoalescedSave';
import { trackPosthogEvent } from '../../utils/analytics/posthog';

// Coalesces blur-driven saves into a single batched flush so tabbing
// across N cells fires ONE save, not N. Also flushes on beforeunload and
// visibility-hidden so backgrounded tabs never lose a queued edit.
//
// Tests use real timers + a small coalesceMs so they stay fast (under
// ~100ms each). Fake timers were tried first but broke React 18's
// scheduler — renderHook returned null inside act() callbacks.

describe('useCoalescedSave', () => {
  beforeEach(() => {
    trackPosthogEvent.mockClear();
  });

  it('starts idle with no queued work', () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useCoalescedSave(save, { coalesceMs: 20 }));
    expect(result.current.status).toBe('idle');
  });

  it('coalesces multiple enqueues within the window into a single save call', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useCoalescedSave(save, { coalesceMs: 30, flashMs: 30 }));

    act(() => {
      result.current.enqueue({ id: 1, name: 'a' });
      result.current.enqueue({ id: 2, name: 'b' });
      result.current.enqueue({ id: 3, name: 'c' });
    });
    expect(result.current.status).toBe('dirty');
    expect(save).not.toHaveBeenCalled();

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
      { id: 3, name: 'c' }
    ]);
    await waitFor(() => expect(result.current.status).toBe('saved'));
  });

  it('ignores null/undefined enqueues (no save scheduled)', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useCoalescedSave(save, { coalesceMs: 30 }));
    act(() => {
      result.current.enqueue(null);
      result.current.enqueue(undefined);
    });
    expect(result.current.status).toBe('idle');
    await new Promise((r) => setTimeout(r, 60));
    expect(save).not.toHaveBeenCalled();
  });

  it('flush() drains the queue immediately and skips the debounce', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useCoalescedSave(save, { coalesceMs: 5000 }));
    act(() => {
      result.current.enqueue({ id: 1 });
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it('beforeunload triggers a flush when the queue is non-empty', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useCoalescedSave(save, { coalesceMs: 5000 }));
    act(() => {
      result.current.enqueue({ id: 99 });
    });
    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith([{ id: 99 }]);
  });

  it('visibilitychange → hidden triggers a flush', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useCoalescedSave(save, { coalesceMs: 5000 }));
    act(() => {
      result.current.enqueue({ id: 'tab-hidden' });
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });

  it('flips to error and reports to PostHog when save rejects', async () => {
    const save = vi.fn(() => Promise.reject(new Error('boom')));
    const { result } = renderHook(() => useCoalescedSave(save, { coalesceMs: 20 }));
    act(() => {
      result.current.enqueue({ id: 1 });
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(trackPosthogEvent).toHaveBeenCalledWith(
      'sequence_save_failed',
      expect.objectContaining({ error: 'boom', operation: 'sequences_inline_edit' })
    );
  });

  it('always uses the latest save callback (no stale closure across re-renders)', async () => {
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());

    const { result, rerender } = renderHook(({ save }) => useCoalescedSave(save, { coalesceMs: 20 }), {
      initialProps: { save: first }
    });

    rerender({ save: second });
    act(() => {
      result.current.enqueue({ id: 1 });
    });
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
  });
});
