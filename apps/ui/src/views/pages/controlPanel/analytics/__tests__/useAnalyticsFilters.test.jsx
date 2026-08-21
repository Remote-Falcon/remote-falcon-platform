import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import moment from 'moment-timezone';
import React from 'react';

import useAnalyticsFilters, { formatRangeLabel } from '../useAnalyticsFilters';
import { DEFAULT_PRESET_ID, buildPresets } from '../dateRange';

// The one invariant this hook owes the page: the label it renders and the
// range it resolves must describe the SAME window. They used to be able to
// disagree — 'custom' persisted to localStorage while its bounds lived only
// in the URL, so a sidebar round-trip left presetId==='custom' with no
// bounds and the range memo fell through to presets[0] (Tonight) under a
// "Custom" label. Every test here is a guard on that pair agreeing.

const TZ = 'America/Chicago';
const LS_KEY = 'rf-analytics-last-preset';
const LS_CUSTOM_KEY = 'rf-analytics-last-custom-range';

const buildStore = (timezone = TZ) => {
  const slice = createSlice({
    name: 'show',
    initialState: { show: { timezone } },
    reducers: {}
  });
  return configureStore({ reducer: { show: slice.reducer } });
};

const wrap = (store, entry = '/control-panel/analytics/overview') => ({ children }) => (
  <Provider store={store}>
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/control-panel/analytics/*" element={children} />
      </Routes>
    </MemoryRouter>
  </Provider>
);

// Render the hook alongside the live location so URL side-effects (the
// backfill) are assertable, not just inferred.
const useProbe = () => {
  const filters = useAnalyticsFilters();
  const { search } = useLocation();
  return { ...filters, search };
};

const render = (entry) => renderHook(() => useProbe(), { wrapper: wrap(buildStore(), entry) });

const presets = buildPresets({ timezone: TZ, customSeasons: [], yearRoundMode: false });
const presetById = (id) => presets.find((p) => p.id === id);
const rangeFor = (id) => presetById(id).getRange(moment.tz(undefined, TZ), TZ);

// The label a preset id promises. If `presetLabel` says this, `range` had
// better be the matching preset's window.
const labelFor = (id) => presetById(id).label;

describe('useAnalyticsFilters — preset resolution', () => {
  beforeEach(() => localStorage.clear());

  it('opens on the default preset with a matching label', () => {
    const { result } = render('/control-panel/analytics/overview');
    expect(result.current.presetId).toBe(DEFAULT_PRESET_ID);
    expect(result.current.presetLabel).toBe(labelFor(DEFAULT_PRESET_ID));
    expect(result.current.range).toEqual(rangeFor(DEFAULT_PRESET_ID));
  });

  it('honours a preset from the URL', () => {
    const { result } = render('/control-panel/analytics/overview?range=last-30');
    expect(result.current.presetId).toBe('last-30');
    expect(result.current.presetLabel).toBe(labelFor('last-30'));
    expect(result.current.range).toEqual(rangeFor('last-30'));
  });

  it('falls back to the default — labelled as such — for an unknown preset id', () => {
    const { result } = render('/control-panel/analytics/overview?range=not-a-preset');
    expect(result.current.presetLabel).toBe(labelFor(DEFAULT_PRESET_ID));
    expect(result.current.range).toEqual(rangeFor(DEFAULT_PRESET_ID));
  });

  it('setPreset writes the URL and drops any stale custom bounds', () => {
    const { result } = render('/control-panel/analytics/overview?range=custom&start=1000&end=2000');
    act(() => result.current.setPreset('last-30'));
    expect(result.current.search).toContain('range=last-30');
    expect(result.current.search).not.toContain('start=');
    expect(result.current.search).not.toContain('end=');
  });
});

describe('useAnalyticsFilters — custom range from the URL', () => {
  beforeEach(() => localStorage.clear());

  it('uses the URL bounds verbatim when they are well-formed', () => {
    const start = moment.tz({ year: 2026, month: 2, day: 1 }, TZ).startOf('day').valueOf();
    const end = moment.tz({ year: 2026, month: 2, day: 15 }, TZ).endOf('day').valueOf();
    const { result } = render(`/control-panel/analytics/overview?range=custom&start=${start}&end=${end}`);
    expect(result.current.presetId).toBe('custom');
    expect(result.current.presetLabel).toBe('Mar 1 – 15, 2026');
    expect(result.current.range).toEqual({ start, end });
    expect(result.current.customRange).toEqual({ start, end });
  });

  it('degrades a malformed ?range=custom&start=abc to a correctly-labelled fallback', () => {
    const { result } = render('/control-panel/analytics/overview?range=custom&start=abc&end=999');
    expect(result.current.presetLabel).not.toBe('Custom');
    expect(result.current.presetLabel).toBe(labelFor(DEFAULT_PRESET_ID));
    expect(result.current.presetId).toBe(DEFAULT_PRESET_ID);
    expect(result.current.range).toEqual(rangeFor(DEFAULT_PRESET_ID));
    expect(result.current.customRange).toBeNull();
  });

  it('degrades ?range=custom with no bounds at all rather than rendering another preset', () => {
    const { result } = render('/control-panel/analytics/overview?range=custom');
    expect(result.current.presetLabel).toBe(labelFor(DEFAULT_PRESET_ID));
    expect(result.current.range).toEqual(rangeFor(DEFAULT_PRESET_ID));
    // Specifically NOT Tonight — the old fall-through picked presets[0].
    expect(result.current.range).not.toEqual(rangeFor('tonight'));
  });

  it('degrades a backwards custom range instead of resolving a negative window', () => {
    const { result } = render('/control-panel/analytics/overview?range=custom&start=2000&end=1000');
    expect(result.current.presetLabel).toBe(labelFor(DEFAULT_PRESET_ID));
    expect(result.current.range.end).toBeGreaterThan(result.current.range.start);
  });
});

describe('useAnalyticsFilters — custom range survives a remount with no URL params', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the label and the range in agreement after navigating away and back', () => {
    const start = moment.tz({ year: 2026, month: 2, day: 1 }, TZ).startOf('day').valueOf();
    const end = moment.tz({ year: 2026, month: 2, day: 15 }, TZ).endOf('day').valueOf();

    const first = render('/control-panel/analytics/overview');
    act(() => first.result.current.setCustomRange(start, end));
    expect(first.result.current.range).toEqual({ start, end });
    first.unmount();

    // Sidebar round-trip: the search string does not survive a route
    // outside this subtree, so the hook remounts on a bare URL.
    const { result } = render('/control-panel/analytics/overview');
    expect(result.current.presetLabel).toBe('Mar 1 – 15, 2026');
    expect(result.current.presetId).toBe('custom');
    expect(result.current.range).toEqual({ start, end });
    expect(result.current.range).not.toEqual(rangeFor('tonight'));
  });

  it('backfills the restored bounds into the URL so the view stays shareable', () => {
    const start = moment.tz({ year: 2026, month: 2, day: 1 }, TZ).startOf('day').valueOf();
    const end = moment.tz({ year: 2026, month: 2, day: 15 }, TZ).endOf('day').valueOf();

    const first = render('/control-panel/analytics/overview');
    act(() => first.result.current.setCustomRange(start, end));
    first.unmount();

    const { result } = render('/control-panel/analytics/overview');
    expect(result.current.search).toContain('range=custom');
    expect(result.current.search).toContain(`start=${start}`);
    expect(result.current.search).toContain(`end=${end}`);
  });

  it('never backfills range=custom without bounds (legacy persisted id)', () => {
    // Pre-fix builds persisted the bare string 'custom' with the bounds
    // living only in the URL. That value is still out there in browsers.
    localStorage.setItem(LS_KEY, 'custom');
    const { result } = render('/control-panel/analytics/overview');
    expect(result.current.search).not.toContain('range=custom');
    expect(result.current.presetLabel).toBe(labelFor(DEFAULT_PRESET_ID));
    expect(result.current.range).toEqual(rangeFor(DEFAULT_PRESET_ID));
  });

  it('ignores persisted bounds that no longer parse', () => {
    localStorage.setItem(LS_KEY, 'custom');
    localStorage.setItem(LS_CUSTOM_KEY, '{not json');
    const { result } = render('/control-panel/analytics/overview');
    expect(result.current.presetLabel).toBe(labelFor(DEFAULT_PRESET_ID));
    expect(result.current.range).toEqual(rangeFor(DEFAULT_PRESET_ID));
  });

  it('does not let persisted custom bounds leak into a URL-specified preset', () => {
    const start = moment.tz({ year: 2026, month: 2, day: 1 }, TZ).startOf('day').valueOf();
    const end = moment.tz({ year: 2026, month: 2, day: 15 }, TZ).endOf('day').valueOf();
    const first = render('/control-panel/analytics/overview');
    act(() => first.result.current.setCustomRange(start, end));
    first.unmount();

    const { result } = render('/control-panel/analytics/overview?range=tonight');
    expect(result.current.presetLabel).toBe(labelFor('tonight'));
    expect(result.current.range).toEqual(rangeFor('tonight'));
  });

  it('still persists plain presets across a remount', () => {
    const first = render('/control-panel/analytics/overview');
    act(() => first.result.current.setPreset('last-30'));
    first.unmount();

    const { result } = render('/control-panel/analytics/overview');
    expect(result.current.presetId).toBe('last-30');
    expect(result.current.presetLabel).toBe(labelFor('last-30'));
    expect(result.current.search).toContain('range=last-30');
  });
});

describe('useAnalyticsFilters — compare + prior period', () => {
  beforeEach(() => localStorage.clear());

  it('reads compare=prior off the URL and toggles it back off', () => {
    const { result } = render('/control-panel/analytics/overview?range=last-7&compare=prior');
    expect(result.current.compareToPrior).toBe(true);
    act(() => result.current.toggleCompareToPrior());
    expect(result.current.compareToPrior).toBe(false);
  });

  it('prior period is the same length immediately preceding the range', () => {
    const start = moment.tz({ year: 2026, month: 2, day: 1 }, TZ).startOf('day').valueOf();
    const end = moment.tz({ year: 2026, month: 2, day: 15 }, TZ).endOf('day').valueOf();
    const { result } = render(`/control-panel/analytics/overview?range=custom&start=${start}&end=${end}`);
    expect(result.current.priorRange).toEqual({ start: start - (end - start), end: start });
  });
});

// The custom label is the only place the operator can read which window is
// on screen without reopening the picker, so its collapsing rules are worth
// pinning: shared month and shared year each drop the redundant half.
describe('formatRangeLabel', () => {
  const at = (y, m, d, edge) => moment.tz({ year: y, month: m, day: d }, TZ)[edge]('day').valueOf();

  it('collapses a within-month range to one month name', () => {
    const r = { start: at(2025, 11, 12, 'startOf'), end: at(2025, 11, 19, 'endOf') };
    expect(formatRangeLabel(r, TZ)).toBe('Dec 12 – 19, 2025');
  });

  it('keeps both month names inside one year', () => {
    const r = { start: at(2025, 10, 15, 'startOf'), end: at(2025, 11, 31, 'endOf') };
    expect(formatRangeLabel(r, TZ)).toBe('Nov 15 – Dec 31, 2025');
  });

  it('spells out both years when the range crosses a year boundary', () => {
    const r = { start: at(2025, 11, 28, 'startOf'), end: at(2026, 0, 3, 'endOf') };
    expect(formatRangeLabel(r, TZ)).toBe('Dec 28, 2025 – Jan 3, 2026');
  });

  it('renders a single day without a dash', () => {
    const r = { start: at(2025, 11, 25, 'startOf'), end: at(2025, 11, 25, 'endOf') };
    expect(formatRangeLabel(r, TZ)).toBe('Dec 25, 2025');
  });

  it('falls back to Custom rather than printing an invalid date', () => {
    expect(formatRangeLabel(null, TZ)).toBe('Custom');
    expect(formatRangeLabel({ start: undefined, end: undefined }, TZ)).toBe('Custom');
  });
});
