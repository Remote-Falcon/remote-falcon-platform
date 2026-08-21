import { useCallback, useEffect, useMemo, useRef } from 'react';

import moment from 'moment-timezone';
import { useLocation, useSearchParams } from 'react-router-dom';

import { useSelector } from '../../../../store';

import { DEFAULT_PRESET_ID, buildPresets } from './dateRange';

// Persist the most-recent preset choice across navigation. Without this,
// leaving Analytics and returning (e.g. via the sidebar) drops back to
// the default preset — the URL search string doesn't survive a route
// outside this subtree. Survival path: URL > localStorage > default.
const LS_KEY = 'rf-analytics-last-preset';
// Custom bounds get their own key: LS_KEY predates custom ranges and still
// holds bare preset ids in the wild. Persisting the bounds is what keeps
// 'custom' from surviving a remount as a label with no window behind it —
// see the resolution comment below.
const LS_CUSTOM_KEY = 'rf-analytics-last-custom-range';

// The analytics shell's index route redirects to /overview. The shell (and
// the date picker inside it) mount while that redirect is still pending, so
// a replace-navigation from the backfill below lands on the tabless parent
// path and strands the user on an empty Outlet — a blank Analytics page that
// only recovers when a tab is clicked. Hold the backfill until a tab has
// resolved. Guarded by __tests__/analyticsLanding.test.jsx.
const BARE_ANALYTICS_PATH = /\/analytics\/?$/;

// Render a resolved custom window as something an operator can read at a
// glance, collapsing whatever the two ends share: same month keeps one
// month name, same year keeps one year. Formatted in the show's timezone
// so it matches the boundaries actually queried.
export const formatRangeLabel = (range, timezone) => {
  if (!range?.start || !range?.end) return 'Custom';
  const start = moment.tz(range.start, timezone);
  const end = moment.tz(range.end, timezone);
  if (!start.isValid() || !end.isValid()) return 'Custom';
  if (start.isSame(end, 'day')) return start.format('MMM D, YYYY');
  if (start.isSame(end, 'month')) return `${start.format('MMM D')} – ${end.format('D, YYYY')}`;
  if (start.isSame(end, 'year')) return `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`;
  return `${start.format('MMM D, YYYY')} – ${end.format('MMM D, YYYY')}`;
};

const readStoredBounds = () => {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_KEY);
    if (!raw) return { start: null, end: null };
    const parsed = JSON.parse(raw);
    return { start: parsed?.start ?? null, end: parsed?.end ?? null };
  } catch {
    // Blocked storage or a half-written value — treat as "no bounds" and
    // let the caller fall back to the default preset.
    return { start: null, end: null };
  }
};

const readLastSelection = () => {
  try {
    const id = localStorage.getItem(LS_KEY) || null;
    if (!id) return null;
    return id === 'custom' ? { id, ...readStoredBounds() } : { id, start: null, end: null };
  } catch {
    return null;
  }
};

const writeLastSelection = (id, start = null, end = null) => {
  try {
    if (!id) return;
    localStorage.setItem(LS_KEY, id);
    if (id === 'custom' && start !== null && end !== null) {
      localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify({ start, end }));
    } else {
      localStorage.removeItem(LS_CUSTOM_KEY);
    }
  } catch {
    /* storage blocked */
  }
};

// Custom bounds are only usable as a pair: two finite millis timestamps
// with a positive span. Anything else (a hand-edited `?start=abc`, a
// half-written link, a legacy 'custom' with no bounds at all) is not a
// custom range and must not be labelled as one.
const parseBounds = (rawStart, rawEnd) => {
  if (rawStart === null || rawStart === undefined || rawEnd === null || rawEnd === undefined) return null;
  const start = typeof rawStart === 'number' ? rawStart : parseInt(rawStart, 10);
  const end = typeof rawEnd === 'number' ? rawEnd : parseInt(rawEnd, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end <= start) return null;
  return { start, end };
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
  const { pathname } = useLocation();
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
  //
  // The id and its custom bounds must come from the SAME source. Mixing
  // them (a URL `range=custom` borrowing bounds off localStorage) renders
  // one window under another one's label.
  const urlRange = searchParams.get('range');
  const selection = urlRange
    ? { id: urlRange, start: searchParams.get('start'), end: searchParams.get('end') }
    : readLastSelection() || { id: DEFAULT_PRESET_ID, start: null, end: null };
  const compareToPrior = searchParams.get('compare') === 'prior';

  const customRange = useMemo(() => parseBounds(selection.start, selection.end), [selection.start, selection.end]);

  // Resolve the id ONCE, here, and let both `range` and `presetLabel` read
  // it. They used to resolve independently, which let them disagree: the
  // label returned 'Custom' unconditionally while the range memo required
  // bounds, and without them fell through to `presets[0]` — Tonight, not
  // even the default preset. A sidebar round-trip (search string gone,
  // localStorage says 'custom') put tonight's numbers under a "Custom"
  // label. A 'custom' id with no usable bounds is simply not custom.
  const presetId = useMemo(() => {
    if (selection.id === 'custom') return customRange ? 'custom' : DEFAULT_PRESET_ID;
    return presets.some((p) => p.id === selection.id) ? selection.id : DEFAULT_PRESET_ID;
  }, [selection.id, customRange, presets]);

  const range = useMemo(() => {
    if (presetId === 'custom') return customRange;
    const preset = presets.find((p) => p.id === presetId) || presets[0];
    const now = moment.tz(undefined, timezone);
    return preset.getRange(now, timezone);
  }, [presetId, customRange, presets, timezone]);

  // Backfill the URL on first render so deep-links + browser back work
  // consistently with the persisted preset. Without this, the URL says
  // "no preset" while the page renders the persisted one — confusing.
  //
  // Backfill the RESOLVED id, never the raw one: writing `range=custom`
  // with no bounds made the mislabelled state shareable.
  // Runs once, but not until the route has settled on a tab — see
  // BARE_ANALYTICS_PATH. Keyed on pathname rather than mount so the
  // held-back write still lands after the index redirect resolves.
  const didBackfill = useRef(false);
  useEffect(() => {
    if (didBackfill.current) return;
    if (BARE_ANALYTICS_PATH.test(pathname)) return;
    const next = new URLSearchParams(searchParams);
    if (presetId === 'custom') {
      next.set('range', 'custom');
      next.set('start', String(range.start));
      next.set('end', String(range.end));
    } else {
      // Nothing worth saying when a bare URL already resolves to default.
      if (!urlRange && presetId === DEFAULT_PRESET_ID) return;
      next.set('range', presetId);
      next.delete('start');
      next.delete('end');
    }
    didBackfill.current = true;
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
      writeLastSelection(id);
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
      // Persist the bounds with the id — 'custom' on its own is a label
      // with no window behind it once the URL is gone.
      writeLastSelection('custom', start, end);
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

  // Reads the same resolved `presetId` as `range`, so the label can only
  // ever describe the window the page actually rendered.
  // A custom range names itself. "Custom" told the operator nothing about
  // which window they were looking at, and the only way to find out was to
  // reopen the picker.
  const presetLabel = useMemo(() => {
    if (presetId === 'custom') return formatRangeLabel(range, timezone);
    return (presets.find((p) => p.id === presetId) || presets[0]).label;
  }, [presetId, presets, range, timezone]);

  return {
    range,
    priorRange,
    presetId,
    presetLabel,
    setPreset,
    customRange,
    setCustomRange,
    compareToPrior,
    toggleCompareToPrior,
    presets,
    timezone
  };
};

export default useAnalyticsFilters;
