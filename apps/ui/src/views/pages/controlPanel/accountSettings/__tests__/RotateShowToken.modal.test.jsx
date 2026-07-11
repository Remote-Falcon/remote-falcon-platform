import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import RotateShowTokenModal from '../RotateShowToken.modal';

// The modal exists to make token rotation an explicit, deliberate action:
// rotating kills the FPP/xSchedule plugin connection until the user pastes
// the new token into each plugin's settings. The warning copy IS the
// feature here — the code path itself is a ten-line mutation.

const theme = createTheme();

const renderModal = (props = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <RotateShowTokenModal
        theme={theme}
        handleClose={vi.fn()}
        rotateToken={vi.fn()}
        isRotating={false}
        {...props}
      />
    </ThemeProvider>
  );

describe('RotateShowTokenModal', () => {
  it('warns that plugins stop syncing so users understand the blast radius', () => {
    renderModal();
    // The exact copy is load-bearing — it's the only place users learn
    // their live show breaks until the new token is re-pasted. Don't
    // water this down without updating here.
    expect(screen.getByText(/stop syncing with Remote Falcon/i)).toBeInTheDocument();
  });

  it('wires Cancel to handleClose and Rotate to rotateToken', async () => {
    const handleClose = vi.fn();
    const rotateToken = vi.fn();
    const user = userEvent.setup();

    renderModal({ handleClose, rotateToken });

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(rotateToken).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /rotate token/i }));
    expect(rotateToken).toHaveBeenCalledTimes(1);
  });

  it('also wires the close icon to handleClose', async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    renderModal({ handleClose });

    const closeButton = screen
      .getAllByRole('button')
      .find((btn) => btn.querySelector('[data-testid="CloseIcon"]'));
    expect(closeButton).toBeDefined();
    await user.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('shows loading state on both buttons while rotation is in flight', () => {
    renderModal({ isRotating: true });
    const buttons = screen.getAllByRole('button');
    const loadingButtons = buttons.filter((b) => b.querySelector('.MuiCircularProgress-root'));
    expect(loadingButtons).toHaveLength(2);
  });
});
