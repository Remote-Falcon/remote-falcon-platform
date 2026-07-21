import { useEffect, useRef } from 'react';

import { useSelector } from '../store';
import { fireMilestoneOnce } from '../utils/analytics/posthog';

// PRD-013 P0-3 — `activation_completed` milestone: the show's FIRST
// false→true flip of viewerControlEnabled ("went live"). Watched at the
// Redux level (mounted in MainLayout) rather than hooked into a toggle
// button, because three independent surfaces flip the flag — dashboard,
// viewer settings, and the command palette. The prev-value ref means an
// already-live show reloading the app (no observed transition) never
// fires; fireMilestoneOnce dedupes across sessions and skips
// impersonation entirely.
//
// Selectors are the two primitives, NOT the show slice: subscribing
// MainLayout to the whole slice would re-render the entire layout on
// every setShow dispatch (autosaves fire those constantly).
const useActivationMilestone = () => {
  const subdomain = useSelector((state) => state.show.show?.showSubdomain);
  const enabled = useSelector((state) => !!state.show.show?.preferences?.viewerControlEnabled);
  const prevRef = useRef(null);
  const subdomainRef = useRef(null);

  useEffect(() => {
    // A subdomain change (login, logout, impersonation A→B) is a new
    // baseline, not a transition: record the current value and skip the
    // comparison, otherwise show A's enabled=false vs show B's
    // enabled=true would fire a spurious milestone for show B.
    if (subdomain !== subdomainRef.current) {
      subdomainRef.current = subdomain;
      prevRef.current = subdomain ? enabled : null;
      return;
    }
    if (!subdomain) return;
    const prev = prevRef.current;
    prevRef.current = enabled;
    if (prev === false && enabled) {
      fireMilestoneOnce('activation_completed', subdomain);
    }
  }, [enabled, subdomain]);
};

export default useActivationMilestone;
