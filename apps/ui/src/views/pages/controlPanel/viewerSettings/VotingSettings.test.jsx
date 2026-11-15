import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import VotingSettings from './VotingSettings';
import { store } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { openSnackbar } from '../../../../store/slices/snackbar';
import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';

// #181: the server drops IP rules its matcher can't use, and used to do it
// silently. After a save the operator must be told which entries were not
// saved, and the list on screen must match what was actually stored.

vi.mock('../../../../services/controlPanel/mutations.service', async (importOriginal) => {
  const actual = await importOriginal();
  // Run the real service against a mutation that completes immediately, so
  // the test exercises the real stripping without the network.
  return {
    ...actual,
    savePreferencesService: vi.fn((prefs, _mutation, callback) =>
      actual.savePreferencesService(prefs, (opts) => opts.onCompleted({}), callback)
    )
  };
});

const theme = createTheme();

const renderVoting = (preferences) => {
  store.dispatch(setShow({ showToken: 't', preferences }));
  return render(
    <Provider store={store}>
      <MockedProvider mocks={[]} addTypename={false}>
        <ThemeProvider theme={theme}>
          <VotingSettings />
        </ThemeProvider>
      </MockedProvider>
    </Provider>
  );
};

describe('VotingSettings IP entries that are not saved (#181)', () => {
  beforeEach(() => {
    store.dispatch(setShow(null));
    store.dispatch(openSnackbar({ open: false }));
    savePreferencesService.mockClear();
  });

  it('warns about the dropped entry on save and stores only what was saved', async () => {
    const user = userEvent.setup();
    renderVoting({ checkIfVoted: false, resetVotes: false, dailyVoteLimit: 0, votingExemptIps: ['10.0.0.1', '192.168.1.*'] });

    // Flagged before any save.
    expect(screen.getByText(/1 IP entry will not be saved: 192\.168\.1\.\*/)).toBeInTheDocument();

    await user.click(screen.getAllByRole('checkbox')[0]);

    await waitFor(() => expect(savePreferencesService).toHaveBeenCalled());
    await waitFor(() => {
      const { snackbar } = store.getState();
      expect(snackbar.message).toMatch(/1 IP entry was not saved: 192\.168\.1\.\*/);
      expect(snackbar.alert.color).toBe('warning');
    });
    expect(store.getState().show.show.preferences.votingExemptIps).toEqual(['10.0.0.1']);
  });

  it('shows no warning when every entry is usable', async () => {
    const user = userEvent.setup();
    renderVoting({ checkIfVoted: false, resetVotes: false, dailyVoteLimit: 0, votingExemptIps: ['10.0.0.1'] });

    await user.click(screen.getAllByRole('checkbox')[0]);

    await waitFor(() => expect(savePreferencesService).toHaveBeenCalled());
    expect(store.getState().snackbar.message).not.toMatch(/not saved/);
  });
});
