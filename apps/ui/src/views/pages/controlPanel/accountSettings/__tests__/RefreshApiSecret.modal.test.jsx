import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import RefreshApiSecretModal from '../RefreshApiSecret.modal';

// The modal exists to make secret rotation an explicit, deliberate action:
// users get a chance to back out before invalidating every JWT signed with
// the current secret. These tests pin the buttons-and-wiring contract.

const theme = createTheme();

const renderModal = (props = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <RefreshApiSecretModal
        theme={theme}
        handleClose={vi.fn()}
        refreshSecret={vi.fn()}
        isRefreshing={false}
        {...props}
      />
    </ThemeProvider>
  );

describe('RefreshApiSecretModal', () => {
  it('warns about JWT invalidation so users understand the blast radius', () => {
    renderModal();
    // The exact copy is load-bearing — it's the only place users learn the
    // rotation is non-trivial. Don't water this down without updating here.
    expect(
      screen.getByText(/invalidate any JWTs signed with the current secret/i)
    ).toBeInTheDocument();
  });

  it('wires Cancel to handleClose and Refresh to refreshSecret', async () => {
    const handleClose = vi.fn();
    const refreshSecret = vi.fn();
    const user = userEvent.setup();

    renderModal({ handleClose, refreshSecret });

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(refreshSecret).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /refresh secret/i }));
    expect(refreshSecret).toHaveBeenCalledTimes(1);
  });

  it('also wires the close icon to handleClose', async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    renderModal({ handleClose });

    // The MainCard secondary slot renders a close IconButton — find it
    // by its CloseIcon SVG via its accessible role.
    const closeButton = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-testid="CloseIcon"]'));
    expect(closeButton).toBeDefined();
    await user.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('shows loading state on both buttons while rotation is in flight', () => {
    renderModal({ isRefreshing: true });
    // MUI LoadingButton drops `disabled` + a progress indicator on the
    // button while loading; the visible label is hidden behind the
    // loadingIndicator slot, so query by role and assert disabled state.
    const buttons = screen.getAllByRole('button');
    // Cancel + Refresh + the close-icon button = 3 buttons; the two
    // LoadingButtons (Cancel, Refresh) are the ones with the loading state.
    const loadingButtons = buttons.filter((b) => b.querySelector('.MuiCircularProgress-root'));
    expect(loadingButtons).toHaveLength(2);
  });
});
