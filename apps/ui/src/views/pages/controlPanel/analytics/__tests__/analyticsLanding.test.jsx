import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import React from 'react';

import useAnalyticsFilters from '../useAnalyticsFilters';

// Landing on the bare /control-panel/analytics path used to render an empty
// Outlet whenever a preset was already stored: the shell and the date picker
// both mount while the index route's redirect to /overview is still pending,
// and the filter hook's URL backfill did a replace-navigation that clobbered
// it. The page recovered only when a tab was clicked.
//
// These tests mirror the real route shape (parent shell, index redirect, one
// leaf) with two hook consumers at shell level, matching index.jsx.

const LS_KEY = 'rf-analytics-last-preset';
const LS_CUSTOM_KEY = 'rf-analytics-last-custom-range';

const buildStore = () => {
  const slice = createSlice({
    name: 'show',
    initialState: { show: { timezone: 'America/Chicago', showSubdomain: 'holtz' } },
    reducers: {}
  });
  return configureStore({ reducer: { show: slice.reducer } });
};

// The date picker: a second shell-level consumer of the same hook, so the
// test covers the real "two mount effects race one redirect" shape.
const PickerStub = () => {
  useAnalyticsFilters();
  return <div>picker</div>;
};

const ShellStub = () => {
  useAnalyticsFilters();
  return (
    <div>
      <PickerStub />
      <Outlet />
    </div>
  );
};

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
};

const renderAt = (entry) =>
  render(
    <Provider store={buildStore()}>
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Routes>
          <Route path="/control-panel/analytics" element={<ShellStub />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<div>OVERVIEW CONTENT</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>
  );

describe('landing on the bare analytics path', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the overview tab when nothing is stored', () => {
    renderAt('/control-panel/analytics');
    expect(screen.queryByText('OVERVIEW CONTENT')).not.toBeNull();
  });

  it('renders the overview tab when a non-default preset is stored', () => {
    localStorage.setItem(LS_KEY, 'last-30');
    renderAt('/control-panel/analytics');
    expect(screen.queryByText('OVERVIEW CONTENT')).not.toBeNull();
  });

  it('renders the overview tab when a stored custom range is restored', () => {
    localStorage.setItem(LS_KEY, 'custom');
    localStorage.setItem(
      LS_CUSTOM_KEY,
      JSON.stringify({ start: Date.UTC(2025, 11, 12), end: Date.UTC(2025, 11, 19) })
    );
    renderAt('/control-panel/analytics');
    expect(screen.queryByText('OVERVIEW CONTENT')).not.toBeNull();
  });

  it('still backfills the URL once the redirect has settled', () => {
    localStorage.setItem(LS_KEY, 'last-30');
    renderAt('/control-panel/analytics');
    // The held-back write lands on the resolved tab, not the tabless parent.
    expect(screen.getByTestId('loc').textContent).toBe('/control-panel/analytics/overview?range=last-30');
  });

  it('backfills directly when landing on a tab', () => {
    localStorage.setItem(LS_KEY, 'last-30');
    renderAt('/control-panel/analytics/overview');
    expect(screen.queryByText('OVERVIEW CONTENT')).not.toBeNull();
    expect(screen.getByTestId('loc').textContent).toBe('/control-panel/analytics/overview?range=last-30');
  });
});
