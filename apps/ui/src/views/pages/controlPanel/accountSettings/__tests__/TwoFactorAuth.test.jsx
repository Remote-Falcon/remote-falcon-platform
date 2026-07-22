import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// The enroll flow is the security-sensitive path: the secret must be
// surfaced for manual entry, the confirm code gates activation, and the
// recovery codes appear exactly once after confirmation. These tests pin
// that sequence with the service layer mocked at the module boundary.

const { mocks } = vi.hoisted(() => ({
  mocks: {
    dispatch: vi.fn(),
    state: { show: { show: { showSubdomain: 'testshow', mfaEnabled: false } } },
    startMfaEnrollmentService: vi.fn(),
    confirmMfaEnrollmentService: vi.fn(),
    disableMfaService: vi.fn(),
    regenerateRecoveryCodesService: vi.fn()
  }
}));

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useMutation: () => [vi.fn()] };
});

vi.mock('../../../../../store', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (fn) => fn(mocks.state)
}));

vi.mock('../../../../../services/controlPanel/mutations.service', () => ({
  startMfaEnrollmentService: mocks.startMfaEnrollmentService,
  confirmMfaEnrollmentService: mocks.confirmMfaEnrollmentService,
  disableMfaService: mocks.disableMfaService,
  regenerateRecoveryCodesService: mocks.regenerateRecoveryCodesService
}));

vi.mock('../../../../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

vi.mock('js-file-download', () => ({
  default: vi.fn()
}));

vi.mock('qr-code-styling', () => ({
  default: class {
    append() {}
  }
}));

import TwoFactorAuth from '../TwoFactorAuth';

const theme = createTheme();

const renderPage = () =>
  render(
    <ThemeProvider theme={theme}>
      <TwoFactorAuth />
    </ThemeProvider>
  );

describe('TwoFactorAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = { show: { show: { showSubdomain: 'testshow', mfaEnabled: false } } };
  });

  it('renders the disabled state with a setup button and no manage actions', () => {
    renderPage();

    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set up two-factor authentication/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /regenerate recovery codes/i })).not.toBeInTheDocument();
  });

  it('starts enrollment and shows the secret plus the confirm-code field', async () => {
    const user = userEvent.setup();
    mocks.startMfaEnrollmentService.mockImplementation((mutationFn, callback) =>
      callback({
        success: true,
        enrollment: { otpauthUri: 'otpauth://totp/RF:testshow?secret=JBSWY3DPEHPK3PXP', secret: 'JBSWY3DPEHPK3PXP' }
      })
    );

    renderPage();
    await user.click(screen.getByRole('button', { name: /set up two-factor authentication/i }));

    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByTestId('mfa-qr')).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    // Activation is gated on a full 6-digit code.
    expect(screen.getByRole('button', { name: /verify & enable/i })).toBeDisabled();
  });

  it('confirms enrollment, shows the one-time recovery codes, and flips show state', async () => {
    const user = userEvent.setup();
    const recoveryCodes = ['AAAAA-BBBBB', 'CCCCC-DDDDD'];
    mocks.startMfaEnrollmentService.mockImplementation((mutationFn, callback) =>
      callback({ success: true, enrollment: { otpauthUri: 'otpauth://x', secret: 'SECRET' } })
    );
    mocks.confirmMfaEnrollmentService.mockImplementation((code, mutationFn, callback) =>
      callback({ success: true, recoveryCodes, toast: { message: 'Two-Factor Authentication Enabled' } })
    );

    renderPage();
    await user.click(screen.getByRole('button', { name: /set up two-factor authentication/i }));
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify & enable/i }));

    expect(mocks.confirmMfaEnrollmentService.mock.calls[0][0]).toEqual('123456');
    expect(screen.getByText('AAAAA-BBBBB')).toBeInTheDocument();
    expect(screen.getByText('CCCCC-DDDDD')).toBeInTheDocument();
    expect(screen.getByText(/they will not be shown again/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download codes/i })).toBeInTheDocument();

    // Redux show state must flip so the status chip + guards update
    // without a full GET_SHOW refetch.
    const setShowAction = mocks.dispatch.mock.calls.map((c) => c[0]).find((a) => a?.type === 'show/setShow');
    expect(setShowAction?.payload?.mfaEnabled).toBe(true);
  });

  it('renders manage actions (regenerate + disable) when 2FA is enabled', () => {
    mocks.state = { show: { show: { showSubdomain: 'testshow', mfaEnabled: true } } };

    renderPage();

    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate recovery codes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set up two-factor authentication/i })).not.toBeInTheDocument();
  });
});
