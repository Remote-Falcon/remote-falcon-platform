import { useEffect, useRef } from 'react';

import { useSelector } from '../store';
import { trackPosthogEvent } from '../utils/analytics/posthog';
import safeStorage from '../utils/safeStorage';

// PRD-013 P0-3 — `activation_completed` milestone: the show's FIRST
// false→true flip of viewerControlEnabled ("went live"). Watched at the
// Redux level (mounted in MainLayout) rather than hooked into a toggle
// button, because three independent surfaces flip the flag — dashboard,
// viewer settings, and the command palette. The prev-value ref means an
// already-live show reloading the app (initial value true, no observed
// transition) never fires; the safeStorage flag makes it once-per-show
// across sessions even when the operator toggles off and on again.
const useActivationMilestone = () => {
  const { show } = useSelector((state) => state.show);
  const enabled = !!show?.preferences?.viewerControlEnabled;
  const subdomain = show?.showSubdomain;
  const prevRef = useRef(null);

  useEffect(() => {
    if (!subdomain) {
      prevRef.current = null;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = enabled;
    if (prev === false && enabled) {
      const firedKey = `rf_activation_completed_${subdomain}`;
      if (!safeStorage.getItem(firedKey)) {
        safeStorage.setItem(firedKey, '1');
        trackPosthogEvent('activation_completed');
      }
    }
  }, [enabled, subdomain]);
};

export default useActivationMilestone;
