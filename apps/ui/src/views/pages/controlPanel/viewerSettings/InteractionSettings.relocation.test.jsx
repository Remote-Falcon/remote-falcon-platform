import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import InteractionSettings from './InteractionSettings';
import { store } from '../../../../store';
import { setShow } from '../../../../store/slices/show';

// PSA-v2 PR-5 — Show Settings (Safeguards) tab updates. Pins the
// "PSA list removed; redirect link points to Special Roles" decision
// and the new playAllPsas toggle. These two assertions guarantee a
// future refactor can't silently bring the old PSA Autocomplete back
// or drop the redirect to the new location.

const theme = createTheme();

const seededShow = {
  showToken: 't',
  sequences: [{ name: 'Welcome' }, { name: 'Donation' }],
  psaSequences: [{ name: 'Welcome', order: 0, enabled: true }],
  preferences: {
    psaEnabled: true,
    psaFrequency: 5,
    managePsa: false,
    playAllPsas: false,
    locationCheckMethod: 'NONE',
    allowedRadius: 0.5,
    locationCode: 0,
    hideSequenceCount: 0,
    blockedViewerIps: []
  }
};

const renderSafeguards = () => {
  store.dispatch(setShow(seededShow));
  return render(
    <Provider store={store}>
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <InteractionSettings />
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>
    </Provider>
  );
};

describe('Show Settings (Safeguards) — PSA-v2 PR-5 updates', () => {
  beforeEach(() => {
    store.dispatch(setShow(null));
  });

  it('renders a "Manage PSAs" link to the Special Roles tab', () => {
    renderSafeguards();
    const link = screen.getByTestId('manage-psas-link');
    expect(link).toBeInTheDocument();
    // The link routes to the new Special Roles tab on the Sequences
    // page — matches the route registered in MainRoutes.jsx.
    expect(link).toHaveAttribute('href', '/control-panel/sequences/special-roles');
  });

  it('renders the playAllPsas toggle next to PSA Frequency', () => {
    renderSafeguards();
    const toggle = screen.getByTestId('play-all-psas-toggle');
    expect(toggle).toBeInTheDocument();
    // Default false from the seeded preferences.
    expect(toggle).not.toBeChecked();
    // Co-located with the existing "PSA Frequency" heading. The
    // heading is rendered as an <h4>; the matching TextField label
    // also says "PSA Frequency", so scope to the heading specifically.
    expect(screen.getByRole('heading', { name: 'PSA Frequency' })).toBeInTheDocument();
    expect(screen.getByText('Play all PSAs at cadence')).toBeInTheDocument();
  });

  it('no longer renders the old PSA Sequences multi-select Autocomplete', () => {
    renderSafeguards();
    // The old surface used a multi-select Autocomplete; removing the
    // chip-list management means there are no "remove" chips for the
    // seeded PSA. Easier-to-assert proxy: the old "PSA Sequences"
    // header now appears as a redirect card test-id, and the
    // multi-select listbox is absent. Combine both checks.
    expect(screen.getByTestId('psa-redirect')).toBeInTheDocument();
    // Old UI had a chip with a remove button labelled e.g. "Welcome"
    // inside the Autocomplete value list — that chip should be gone.
    expect(screen.queryByRole('button', { name: 'Welcome' })).not.toBeInTheDocument();
  });
});
