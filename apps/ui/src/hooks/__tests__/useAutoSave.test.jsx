import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

import useAutoSave from '../useAutoSave';
import { trackPosthogEvent } from '../../utils/analytics/posthog';

// Drives the StickyFormBar save indicator. State machine:
//   idle → dirty → saving → saved → idle  (happy path)
//   idle → dirty → error                  (rejected save)
// We pin every transition because a regression silently loses the user's
// edits without giving them any feedback.
//
// Tests use real timers + small delay overrides so they run in ~100ms.

describe('useAutoSave', () => {
  beforeEach(() => {
    trackPosthogEvent.mockClear();
  });

  it('starts idle and stays idle when values do not change', () => {
    const save = vi.fn();
    const { result } = renderHook(({ values }) => useAutoSave(values, save, { delay: 20 }), {
      initialProps: { values: { name: 'a' } }
    });
    expect(result.current).toBe('idle');
    expect(save).not.toHaveBeenCalled();
  });

  it('transitions idle → dirty → saving → saved → idle on a value change', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook(
      ({ values }) => useAutoSave(values, save, { delay: 20, flashMs: 20 }),
      { initialProps: { values: { name: 'a' } } }
    );

    rerender({ values: { name: 'b' } });
    expect(result.current).toBe('dirty');

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ name: 'b' });
    await waitFor(() => expect(result.current).toBe('idle'));
  });

  it('flips to error and reports to PostHog when save rejects', async () => {
    const save = vi.fn(() => Promise.reject(new Error('network down')));
    const { result, rerender } = renderHook(
      ({ values }) => useAutoSave(values, save, { delay: 20 }),
      { initialProps: { values: { name: 'a' } } }
    );

    rerender({ values: { name: 'b' } });
    await waitFor(() => expect(result.current).toBe('error'));
    expect(trackPosthogEvent).toHaveBeenCalledWith(
      'viewer_page_autosave_failed',
      expect.objectContaining({ error: 'network down', operation: 'viewer_page' })
    );
  });

  it('holds dirty (and does not call save) when isValid returns false', async () => {
    const save = vi.fn();
    const isValid = vi.fn(() => false);
    const { result, rerender } = renderHook(
      ({ values }) => useAutoSave(values, save, { delay: 20, isValid }),
      { initialProps: { values: { name: 'a' } } }
    );

    rerender({ values: { name: 'b' } });
    expect(result.current).toBe('dirty');

    await new Promise((r) => setTimeout(r, 60));
    expect(save).not.toHaveBeenCalled();
    expect(result.current).toBe('dirty');
  });

  it('debounces rapid edits into a single save call', async () => {
    const save = vi.fn(() => Promise.resolve());
    const { rerender } = renderHook(
      ({ values }) => useAutoSave(values, save, { delay: 40 }),
      { initialProps: { values: { n: 1 } } }
    );

    rerender({ values: { n: 2 } });
    rerender({ values: { n: 3 } });
    rerender({ values: { n: 4 } });

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({ n: 4 });
  });
});
