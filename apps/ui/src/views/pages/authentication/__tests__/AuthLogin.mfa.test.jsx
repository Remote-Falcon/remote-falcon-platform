import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

// Two-phase sign-in: when JWTContext holds an MFA challenge the login
// form swaps to the code step in place (same route — GuestGuard only
// redirects once verifyMfa flips isLoggedIn). These tests pin the swap,
// the recovery-code toggle, and the escape hatch back to password entry.

const { auth } = vi.hoisted(() => ({
  auth: {
    login: vi.fn(),
    mfaChallenge: null,
    verifyMfa: vi.fn().mockResolvedValue(undefined),
    cancelMfaChallenge: vi.fn()
  }
}));

vi.mock('../../../../hooks/useAuth', () => ({
  default: () => auth
}));

import AuthLogin from '../auth-forms/AuthLogin';

const theme = createTheme();

const renderForm = () =>
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>
        <AuthLogin />
      </MemoryRouter>
    </ThemeProvider>
  );

describe('AuthLogin MFA step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mfaChallenge = 'pending-token';
  });

  it('renders the email/password form when no challenge is pending', () => {
    auth.mfaChallenge = null;
    renderForm();

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/authentication code/i)).not.toBeInTheDocument();
  });

  it('replaces the password form with the code step while a challenge is pending', () => {
    renderForm();

    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/authentication code/i)).toBeInTheDocument();
    expect(screen.getByText(/6-digit code from your authenticator app/i)).toBeInTheDocument();
  });

  it('submits the entered code through verifyMfa', async () => {
    const user = userEvent.setup();
    renderForm();

    const input = screen.getByLabelText(/authentication code/i);
    expect(screen.getByRole('button', { name: /verify/i })).toBeDisabled();

    await user.type(input, '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    expect(auth.verifyMfa).toHaveBeenCalledWith('123456');
  });

  it('toggles to recovery-code entry and submits through the same verifyMfa', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText(/use a recovery code instead/i));
    const input = screen.getByLabelText(/recovery code/i);
    expect(screen.getByText(/enter one of your recovery codes/i)).toBeInTheDocument();

    await user.type(input, 'ABCDE-FGHIJ');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    expect(auth.verifyMfa).toHaveBeenCalledWith('ABCDE-FGHIJ');
  });

  it('returns to the password step via cancelMfaChallenge', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText(/back to sign in/i));

    expect(auth.cancelMfaChallenge).toHaveBeenCalledTimes(1);
  });
});
