import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import React from 'react';

vi.mock('../../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

import { trackPosthogEvent } from '../../../utils/analytics/posthog';
import ImpersonationBanner from '../ImpersonationBanner';

const buildStore = (show) => {
  const slice = createSlice({ name: 'show', initialState: { show }, reducers: {} });
  return configureStore({ reducer: { show: slice.reducer } });
};

const wrap = (show, ui) => (
  <ThemeProvider theme={createTheme()}>
    <Provider store={buildStore(show)}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>
  </ThemeProvider>
);

describe('ImpersonationBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    trackPosthogEvent.mockClear();
  });

  it('renders nothing when the impersonation flag is not set', () => {
    const { container } = render(wrap({ showName: 'X' }, <ImpersonationBanner />));
    expect(container.textContent).not.toContain('IMPERSONATING');
  });

  it('renders the banner + impersonation copy when the flag is set', () => {
    window.localStorage.setItem('isImpersonating', '1');
    render(wrap({ showName: 'Holtz Lights', email: 'matt@h.com' }, <ImpersonationBanner />));
    expect(screen.getByTestId('impersonation-banner')).toBeInTheDocument();
    expect(screen.getByText(/IMPERSONATING/)).toBeInTheDocument();
    expect(screen.getByText(/Holtz Lights/)).toBeInTheDocument();
    expect(screen.getByText(/matt@h\.com/)).toBeInTheDocument();
  });

  it('falls back to "another show" when the show name is unknown', () => {
    window.localStorage.setItem('isImpersonating', '1');
    render(wrap(null, <ImpersonationBanner />));
    expect(screen.getByText(/another show/)).toBeInTheDocument();
  });

  it('Stop Impersonating clears flags, tracks PostHog, and reloads the page', () => {
    window.localStorage.setItem('isImpersonating', '1');
    window.localStorage.setItem('impersonationServiceToken', 'tok');
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload }
    });
    render(wrap({ showSubdomain: 'imitatee', showName: 'X' }, <ImpersonationBanner />));
    fireEvent.click(screen.getByRole('button', { name: /Stop Impersonating/ }));
    expect(window.localStorage.getItem('isImpersonating')).toBeNull();
    expect(window.localStorage.getItem('impersonationServiceToken')).toBeNull();
    expect(trackPosthogEvent).toHaveBeenCalledWith(
      'impersonation_stopped',
      expect.objectContaining({ source: 'banner', target_show_subdomain: 'imitatee' })
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
