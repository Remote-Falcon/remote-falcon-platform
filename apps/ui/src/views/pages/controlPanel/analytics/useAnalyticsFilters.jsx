import { useCallback, useEffect, useMemo } from 'react';

import moment from 'moment-timezone';
import { useSearchParams } from 'react-router-dom';

import { useSelector } from '../../../../store';

import { DEFAULT_PRESET_ID, buildPresets } from './dateRange';

// Persist the most-recent preset choice across navigation. Without this,
// leaving Analytics and returning (e.g. via the sidebar) drops back to
// the default preset — the URL search string doesn't survive a route
// outside this subtree. Survival path: URL > localStorage > default.
const LS_KEY = 'rf-analytics-last-preset';
const readLastPreset = () => {
  try {
    return localStorage.getItem(LS_KEY) || null;
  } catch {
    return null;
  }
};
const writeLastPreset = (id) => {
  try {
    if (id) localStorage.setItem(LS_KEY, id);
  } catch {
    /* storage blocked */
  }
};

// All analytics filter state is URL-encoded so views are shareable and
// bookmarkable. Single source of truth for: date range (preset or custom),
// compare-to-prior toggle, and any chip filters added later.
//
// Returns:
//   { range, presetId, setPreset, customRange, setCustomRange,
//     compareToPrior, toggleCompareToPrior, presets, timezone }
const useAnalyticsFilters = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { show } = useSelector((state) => state.show);
  const timezone = show?.timezone || 'America/New_York';

  // Custom seasons + year-round mode could come from preferences in the
  // future; not in P0 schema yet so default to empty / false.
  const presets = useMemo(
    () => buildPresets({ timezone, customSeasons: [], yearRoundMode: false }),
    [timezone]
  );

  // URL has priority; falling back to the last localStorage choice means
  // returning to Analytics via the sidebar preserves what the user picked.
  const presetId = searchParams.get('range') || readLastPreset() || DEFAULT_PRESET_ID;
  const customStart = searchParams.get('start');
  const customEnd = searchParams.get('end');
  const compareToPrior = searchParams.get('compare') === 'prior';

  // Backfill the URL on first render so deep-links + browser back work
  // consistently with the persisted preset. Without this, the URL says
  // "no preset" while the page renders the persisted one — confusing.
  useEffect(() => {
    if (!searchParams.get('range') && presetId !== DEFAULT_PRESET_ID) {
      const next = new URLSearchParams(searchParams);
      next.set('range', presetId);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const range = useMemo(() => {
    if (presetId === 'custom' && customStart && customEnd) {
      return { start: parseInt(customStart, 10), end: parseInt(customEnd, 10) };
    }
    const preset = presets.find((p) => p.id === presetId) || presets[0];
    const now = moment.tz(undefined, timezone);
    return preset.getRange(now, timezone);
  }, [presetId, customStart, customEnd, presets, timezone]);

  // Prior-period range = same length, immediately preceding.
  const priorRange = useMemo(() => {
    const length = range.end - range.start;
    return { start: range.start - length, end: range.start };
  }, [range]);

  // react-router-dom 6.2 doesn't support the (prev => next) functional form
  // of setSearchParams — that landed in 6.4. On 6.2 the function gets
  // stringified into the URL instead of called, so updates silently no-op.
  // Use the value form, reading from searchParams directly.
  const setPreset = useCallback(
    (id) => {
      writeLastPreset(id);
      const next = new URLSearchParams(searchParams);
      next.set('range', id);
      next.delete('start');
      next.delete('end');
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const setCustomRange = useCallback(
    (start, end) => {
      writeLastPreset('custom');
      const next = new URLSearchParams(searchParams);
      next.set('range', 'custom');
      next.set('start', String(start));
      next.set('end', String(end));
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const toggleCompareToPrior = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (compareToPrior) next.delete('compare');
    else next.set('compare', 'prior');
    setSearchParams(next);
  }, [searchParams, compareToPrior, setSearchParams]);

  const presetLabel = useMemo(() => {
    if (presetId === 'custom') return 'Custom';
    return (presets.find((p) => p.id === presetId) || presets[0]).label;
  }, [presetId, presets]);

  return {
    range,
    priorRange,
    presetId,
    presetLabel,
    setPreset,
    setCustomRange,
    compareToPrior,
    toggleCompareToPrior,
    presets,
    timezone
  };
};

export default useAnalyticsFilters;
