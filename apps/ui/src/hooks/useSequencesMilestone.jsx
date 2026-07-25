import { useEffect } from 'react';

import { useSelector } from '../store';
import { fireMilestoneOnce } from '../utils/analytics/posthog';

// PRD-013 P0-3 — `sequences_imported` milestone: this show has songs in
// it. Watched at the Redux level (mounted in MainLayout) because only one
// of the paths that puts sequences on a show is a browser action. The FPP
// plugin syncs them server-side through plugins-api, so for the common
// setup there is no client-side moment to hang this on at all — which is
// why the event recorded zero occurrences in its first month despite the
// Excel-upload handler capturing it correctly.
//
// Deliberately NOT a false→true transition watcher like
// [useActivationMilestone]: an operator who syncs on the Pi and then opens
// the dashboard presents no observable transition, and that is the single
// most common path. Observing a non-empty list instead covers every path
// (sync, Excel upload, manual add) at the cost of reporting first
// observation rather than the instant of import. The drip gate this feeds
// asks "does this show have songs yet", not "exactly when did they land",
// so the looser reading is the correct one.
//
// fireMilestoneOnce owns dedupe (per show, per device) and skips
// impersonation; the Excel-upload handler fires through the same helper
// and key, so the two callers can never double-count one show.
const useSequencesMilestone = () => {
  const subdomain = useSelector((state) => state.show.show?.showSubdomain);
  const sequenceCount = useSelector((state) => state.show.show?.sequences?.length ?? 0);

  useEffect(() => {
    if (!subdomain || sequenceCount < 1) return;
    fireMilestoneOnce('sequences_imported', subdomain, {
      source: 'observed',
      sequence_count: sequenceCount
    });
  }, [subdomain, sequenceCount]);
};

export default useSequencesMilestone;
