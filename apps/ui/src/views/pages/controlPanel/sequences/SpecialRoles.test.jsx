import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import SpecialRoles from './SpecialRoles';
import { store } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import {
  SET_NEXT_PSA_OVERRIDE,
  SET_REQUEST_LEADER_SEQUENCE,
  SET_VOTE_LEADER_SEQUENCE,
  UPDATE_PSA_ENABLED
} from '../../../../utils/graphql/controlPanel/mutations';

// PSA-v2 PR-5 — Special Roles tab tests. The component is the only place
// the new mutations are wired up from the UI, so these tests double as
// a contract pin: if the variable names / shapes drift, every assertion
// here fires.

const theme = createTheme();

const baseShow = {
  showToken: 't',
  showName: 'Demo',
  sequences: [
    { name: 'Carol of the Bells' },
    { name: 'Welcome Announcement' },
    { name: 'Donation PSA' },
    { name: 'Vote Winner Bumper' }
  ],
  psaSequences: [
    { name: 'Welcome Announcement', order: 0, lastPlayed: null, enabled: true },
    { name: 'Donation PSA', order: 1, lastPlayed: '2026-05-30T19:00:00', enabled: true }
  ],
  requestLeaderSequence: null,
  voteLeaderSequence: null,
  nextPsaOverride: null
};

const renderTab = ({ mocks = [], showOverrides = {} } = {}) => {
  // Seed Redux with the show payload so the component can read it via
  // useSelector. Each test gets a fresh seed because the store is
  // module-scoped and would otherwise leak between tests.
  store.dispatch(setShow({ ...baseShow, ...showOverrides }));
  return render(
    <Provider store={store}>
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <SpecialRoles />
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>
    </Provider>
  );
};

describe('SpecialRoles tab', () => {
  beforeEach(() => {
    store.dispatch(setShow(null));
  });

  it('renders the PSAs section with the existing PSAs from Redux', () => {
    renderTab();
    expect(screen.getByText('PSAs')).toBeInTheDocument();
    expect(screen.getByText('Welcome Announcement')).toBeInTheDocument();
    expect(screen.getByText('Donation PSA')).toBeInTheDocument();
    expect(screen.getByTestId('psa-table')).toBeInTheDocument();
  });

  it('renders the Leaders section with empty (none) values by default', () => {
    renderTab();
    expect(screen.getByText('Leaders')).toBeInTheDocument();
    expect(screen.getByText(/Request leader sequence/i)).toBeInTheDocument();
    expect(screen.getByText(/Vote leader sequence/i)).toBeInTheDocument();
  });

  it('shows the "Next override" chip when Show.nextPsaOverride is set', () => {
    renderTab({ showOverrides: { nextPsaOverride: 'Donation PSA' } });
    const chip = screen.getByTestId('next-override-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent(/Donation PSA/i);
  });

  it('calls updatePsaEnabled with the correct variables when the row Switch is toggled', async () => {
    const user = userEvent.setup();
    let calledWith = null;
    const mocks = [
      {
        request: {
          query: UPDATE_PSA_ENABLED,
          variables: { name: 'Welcome Announcement', enabled: false }
        },
        result: () => {
          calledWith = { name: 'Welcome Announcement', enabled: false };
          return { data: { updatePsaEnabled: true } };
        }
      }
    ];
    renderTab({ mocks });

    const toggle = screen.getByTestId('psa-enabled-Welcome Announcement');
    await user.click(toggle);

    await waitFor(() => expect(calledWith).not.toBeNull());
    expect(calledWith).toEqual({ name: 'Welcome Announcement', enabled: false });
  });

  it('calls setNextPsaOverride with the row name when "Play Next" is clicked', async () => {
    const user = userEvent.setup();
    let calledWith = null;
    const mocks = [
      {
        request: {
          query: SET_NEXT_PSA_OVERRIDE,
          variables: { name: 'Donation PSA' }
        },
        result: () => {
          calledWith = 'Donation PSA';
          return { data: { setNextPsaOverride: true } };
        }
      }
    ];
    renderTab({ mocks });

    const playNext = screen.getByTestId('psa-play-next-Donation PSA');
    await user.click(playNext);
    await waitFor(() => expect(calledWith).toBe('Donation PSA'));
  });

  it('calls setRequestLeaderSequence when a leader is picked from the dropdown', async () => {
    const user = userEvent.setup();
    let calledWith = null;
    const mocks = [
      {
        request: {
          query: SET_REQUEST_LEADER_SEQUENCE,
          variables: { name: 'Carol of the Bells' }
        },
        result: () => {
          calledWith = 'Carol of the Bells';
          return { data: { setRequestLeaderSequence: true } };
        }
      }
    ];
    renderTab({ mocks });

    const input = screen.getByTestId('request-leader-input');
    await user.click(input);
    await user.type(input, 'Carol');
    // Pick the option from the dropdown listbox.
    const option = await screen.findByRole('option', { name: 'Carol of the Bells' });
    await user.click(option);

    await waitFor(() => expect(calledWith).toBe('Carol of the Bells'));
  });

  it('calls setVoteLeaderSequence when a vote leader is picked', async () => {
    const user = userEvent.setup();
    let calledWith = null;
    const mocks = [
      {
        request: {
          query: SET_VOTE_LEADER_SEQUENCE,
          variables: { name: 'Vote Winner Bumper' }
        },
        result: () => {
          calledWith = 'Vote Winner Bumper';
          return { data: { setVoteLeaderSequence: true } };
        }
      }
    ];
    renderTab({ mocks });

    const input = screen.getByTestId('vote-leader-input');
    await user.click(input);
    await user.type(input, 'Vote');
    const option = await screen.findByRole('option', { name: 'Vote Winner Bumper' });
    await user.click(option);

    await waitFor(() => expect(calledWith).toBe('Vote Winner Bumper'));
  });
});
