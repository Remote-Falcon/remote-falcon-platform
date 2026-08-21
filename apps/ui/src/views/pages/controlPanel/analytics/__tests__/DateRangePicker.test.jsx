import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import moment from 'moment-timezone';
import React from 'react';

import DateRangePicker from '../DateRangePicker';

vi.mock('../../../../../utils/analytics/posthog', () => ({ trackPosthogEvent: vi.fn() }));

// A preset label names a rule, not a window — "Last 7 nights" doesn't say
// which nights. The caption under the button is where that window is shown.
// Custom labels itself with its dates, so it must NOT also caption.

const TZ = 'America/Chicago';

const buildStore = () => {
  const slice = createSlice({
    name: 'show',
    initialState: { show: { timezone: TZ, showSubdomain: 'holtz' } },
    reducers: {}
  });
  return configureStore({ reducer: { show: slice.reducer } });
};

const renderAt = (search) =>
  render(
    <Provider store={buildStore()}>
      <MemoryRouter initialEntries={[`/control-panel/analytics/overview${search}`]}>
        <Routes>
          <Route path="/control-panel/analytics/*" element={<DateRangePicker />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );

describe('DateRangePicker range caption', () => {
  beforeEach(() => localStorage.clear());

  it('captions a preset with the window it resolves to', () => {
    renderAt('?range=last-7');
    const caption = screen.getByTestId('date-range-caption').textContent;
    // Resolved live, so assert against today rather than a frozen string.
    // Note the label collapses a shared month, so the end is a bare day
    // number: "Aug 15 – 21, 2026", not "Aug 15 – Aug 21, 2026".
    const start = moment.tz(TZ).subtract(6, 'days');
    const end = moment.tz(TZ);
    expect(caption.startsWith(start.format('MMM D'))).toBe(true);
    expect(caption).toMatch(new RegExp(`${end.format('D')}, ${end.format('YYYY')}$`));
  });

  it('does not caption a custom range, whose label already carries the dates', () => {
    const start = moment.tz({ year: 2025, month: 11, day: 12 }, TZ).startOf('day').valueOf();
    const end = moment.tz({ year: 2025, month: 11, day: 19 }, TZ).endOf('day').valueOf();
    renderAt(`?range=custom&start=${start}&end=${end}`);
    expect(screen.queryByTestId('date-range-caption')).toBeNull();
    expect(screen.getByRole('button', { name: /Dec 12 – 19, 2025/ })).not.toBeNull();
  });
});
