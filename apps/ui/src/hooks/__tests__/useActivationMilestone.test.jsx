import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import useActivationMilestone from '../useActivationMilestone';

// Mock the store's useSelector so tests drive the two selector values
// directly, and the analytics helper so firing is observable.
const state = { subdomain: undefined, enabled: false };
vi.mock('../../store', () => ({
  useSelector: (selector) =>
    selector({
      show: {
        show: state.subdomain
          ? { showSubdomain: state.subdomain, preferences: { viewerControlEnabled: state.enabled } }
          : null
      }
    })
}));

vi.mock('../../utils/analytics/posthog', () => ({
  fireMilestoneOnce: vi.fn()
}));

import { fireMilestoneOnce } from '../../utils/analytics/posthog';

const setState = (subdomain, enabled) => {
  state.subdomain = subdomain;
  state.enabled = enabled;
};

describe('useActivationMilestone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState(undefined, false);
  });

  it('fires on the first observed false-to-true transition', () => {
    setState('myshow', false);
    const { rerender } = renderHook(() => useActivationMilestone());
    setState('myshow', true);
    rerender();
    expect(fireMilestoneOnce).toHaveBeenCalledWith('activation_completed', 'myshow');
  });

  it('does not fire for an already-live show on first render', () => {
    setState('myshow', true);
    const { rerender } = renderHook(() => useActivationMilestone());
    rerender();
    expect(fireMilestoneOnce).not.toHaveBeenCalled();
  });

  it('treats a subdomain change as a new baseline, not a transition', () => {
    // Admin's own show, viewer control off…
    setState('adminshow', false);
    const { rerender } = renderHook(() => useActivationMilestone());
    // …impersonates a live show: A(false) → B(true) must NOT fire.
    setState('targetshow', true);
    rerender();
    expect(fireMilestoneOnce).not.toHaveBeenCalled();
  });

  it('fires for the new show only on a transition observed under that show', () => {
    setState('adminshow', false);
    const { rerender } = renderHook(() => useActivationMilestone());
    setState('targetshow', false);
    rerender();
    setState('targetshow', true);
    rerender();
    expect(fireMilestoneOnce).toHaveBeenCalledTimes(1);
    expect(fireMilestoneOnce).toHaveBeenCalledWith('activation_completed', 'targetshow');
  });

  it('resets cleanly through logout (subdomain null) and back', () => {
    setState('myshow', true);
    const { rerender } = renderHook(() => useActivationMilestone());
    setState(undefined, false);
    rerender();
    setState('myshow', false);
    rerender();
    setState('myshow', true);
    rerender();
    expect(fireMilestoneOnce).toHaveBeenCalledTimes(1);
  });

  it('does not fire while enabled stays true across rerenders', () => {
    setState('myshow', false);
    const { rerender } = renderHook(() => useActivationMilestone());
    setState('myshow', true);
    rerender();
    rerender();
    rerender();
    expect(fireMilestoneOnce).toHaveBeenCalledTimes(1);
  });
});
