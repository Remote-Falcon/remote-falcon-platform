import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import useSequencesMilestone from '../useSequencesMilestone';

// Mock the store's useSelector so tests drive the two selector values
// directly, and the analytics helper so firing is observable.
const state = { subdomain: undefined, count: 0 };
vi.mock('../../store', () => ({
  useSelector: (selector) =>
    selector({
      show: {
        show: state.subdomain
          ? {
              showSubdomain: state.subdomain,
              sequences: Array.from({ length: state.count }, (_, i) => ({ name: `seq${i}` }))
            }
          : null
      }
    })
}));

vi.mock('../../utils/analytics/posthog', () => ({
  fireMilestoneOnce: vi.fn()
}));

import { fireMilestoneOnce } from '../../utils/analytics/posthog';

const setState = (subdomain, count) => {
  state.subdomain = subdomain;
  state.count = count;
};

describe('useSequencesMilestone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState(undefined, 0);
  });

  it('fires when an empty show gains its first sequences', () => {
    setState('myshow', 0);
    const { rerender } = renderHook(() => useSequencesMilestone());
    expect(fireMilestoneOnce).not.toHaveBeenCalled();
    setState('myshow', 12);
    rerender();
    expect(fireMilestoneOnce).toHaveBeenCalledWith('sequences_imported', 'myshow', {
      source: 'observed',
      sequence_count: 12
    });
  });

  // The whole point of the rewrite: a Pi-side FPP sync produces no
  // client transition, so the show simply loads already-populated.
  it('fires for a show that loads already populated (the FPP sync path)', () => {
    setState('myshow', 40);
    renderHook(() => useSequencesMilestone());
    expect(fireMilestoneOnce).toHaveBeenCalledWith('sequences_imported', 'myshow', {
      source: 'observed',
      sequence_count: 40
    });
  });

  it('does not fire for a show with no sequences', () => {
    setState('myshow', 0);
    const { rerender } = renderHook(() => useSequencesMilestone());
    rerender();
    rerender();
    expect(fireMilestoneOnce).not.toHaveBeenCalled();
  });

  it('does not fire before a show is loaded', () => {
    setState(undefined, 0);
    renderHook(() => useSequencesMilestone());
    expect(fireMilestoneOnce).not.toHaveBeenCalled();
  });

  // Dedupe is fireMilestoneOnce's job, but the effect must not re-call it
  // on every autosave-driven rerender that leaves the count unchanged.
  it('calls once while the count holds steady across rerenders', () => {
    setState('myshow', 5);
    const { rerender } = renderHook(() => useSequencesMilestone());
    rerender();
    rerender();
    expect(fireMilestoneOnce).toHaveBeenCalledTimes(1);
  });

  it('reports the new show after a subdomain change', () => {
    setState('adminshow', 3);
    const { rerender } = renderHook(() => useSequencesMilestone());
    setState('targetshow', 9);
    rerender();
    expect(fireMilestoneOnce).toHaveBeenLastCalledWith('sequences_imported', 'targetshow', {
      source: 'observed',
      sequence_count: 9
    });
  });
});
