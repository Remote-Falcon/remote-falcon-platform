import { useCallback, useMemo } from 'react';

import moment from 'moment-timezone';
import { useSearchParams } from 'react-router-dom';

import { useSelector } from '../../../../store';

import { DEFAULT_PRESET_ID, buildPresets } from './dateRange';

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

  const presetId = searchParams.get('range') || DEFAULT_PRESET_ID;
  const customStart = searchParams.get('start');
  const customEnd = searchParams.get('end');
  const compareToPrior = searchParams.get('compare') === 'prior';

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

  const setPreset = useCallback(
    (id) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('range', id);
        next.delete('start');
        next.delete('end');
        return next;
      });
    },
    [setSearchParams]
  );

  const setCustomRange = useCallback(
    (start, end) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('range', 'custom');
        next.set('start', String(start));
        next.set('end', String(end));
        return next;
      });
    },
    [setSearchParams]
  );

  const toggleCompareToPrior = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (compareToPrior) next.delete('compare');
      else next.set('compare', 'prior');
      return next;
    });
  }, [compareToPrior, setSearchParams]);

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
