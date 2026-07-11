import { Buffer } from 'buffer';

import { describe, it, expect, vi } from 'vitest';

import {
  startMfaEnrollmentService,
  confirmMfaEnrollmentService,
  disableMfaService,
  regenerateRecoveryCodesService,
  adminResetMfaService
} from '../mutations.service';

// Pins the callback contract the TwoFactorAuth screen and the admin
// Reset 2FA action rely on, plus the re-auth transport rule: password
// travels base64 in the `Password` header (same as updatePasswordService),
// a TOTP code travels as the `code` variable — never both.

describe('startMfaEnrollmentService', () => {
  it('passes the enrollment payload (otpauthUri + secret) through on success', () => {
    const callback = vi.fn();
    const enrollment = { otpauthUri: 'otpauth://totp/RF:me?secret=ABC', secret: 'ABC' };
    const mutationFn = vi.fn((opts) => opts.onCompleted({ startMfaEnrollment: enrollment }));

    startMfaEnrollmentService(mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true,
      enrollment
    });
  });

  it('maps MFA_NOT_CONFIGURED to the deployment-unavailable message', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onError(new Error('MFA_NOT_CONFIGURED')));

    startMfaEnrollmentService(mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'warning', message: '2FA is not available on this deployment' }
    });
  });

  it('maps MFA_ALREADY_ENABLED to an already-enabled warning', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onError(new Error('MFA_ALREADY_ENABLED')));

    startMfaEnrollmentService(mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'warning', message: 'Two-factor authentication is already enabled' }
    });
  });
});

describe('confirmMfaEnrollmentService', () => {
  it('passes the one-time recovery codes through on success', () => {
    const callback = vi.fn();
    const recoveryCodes = ['AAAAA-BBBBB', 'CCCCC-DDDDD'];
    const mutationFn = vi.fn((opts) => opts.onCompleted({ confirmMfaEnrollment: { recoveryCodes } }));

    confirmMfaEnrollmentService('123456', mutationFn, callback);

    expect(mutationFn.mock.calls[0][0].variables).toEqual({ code: '123456' });
    expect(callback).toHaveBeenCalledWith({
      success: true,
      recoveryCodes,
      toast: { message: 'Two-Factor Authentication Enabled' }
    });
  });

  it('maps INVALID_MFA_CODE to a retry warning', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onError(new Error('INVALID_MFA_CODE')));

    confirmMfaEnrollmentService('000000', mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'warning', message: 'Invalid code, try again' }
    });
  });

  it('maps MFA_RATE_LIMITED to the lockout warning', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onError(new Error('MFA_RATE_LIMITED')));

    confirmMfaEnrollmentService('000000', mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'warning', message: 'Too many attempts — wait 15 minutes and try again' }
    });
  });
});

describe('disableMfaService', () => {
  it('sends the password base64 in the Password header and no code variable', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onCompleted());

    disableMfaService({ password: 'hunter2' }, mutationFn, callback);

    const opts = mutationFn.mock.calls[0][0];
    expect(opts.context.headers.Password).toEqual(Buffer.from('hunter2', 'binary').toString('base64'));
    expect(opts.variables).toEqual({ code: null });
    expect(callback).toHaveBeenCalledWith({
      success: true,
      toast: { message: 'Two-Factor Authentication Disabled' }
    });
  });

  it('sends a TOTP code as the code variable with no Password header', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onCompleted());

    disableMfaService({ code: '654321' }, mutationFn, callback);

    const opts = mutationFn.mock.calls[0][0];
    expect(opts.context.headers.Password).toBeUndefined();
    expect(opts.variables).toEqual({ code: '654321' });
  });

  it('maps UNAUTHORIZED (wrong password) to an incorrect-password warning', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onError(new Error('UNAUTHORIZED')));

    disableMfaService({ password: 'nope' }, mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'warning', message: 'Incorrect password' }
    });
  });
});

describe('regenerateRecoveryCodesService', () => {
  it('passes the fresh recovery codes through on success', () => {
    const callback = vi.fn();
    const recoveryCodes = ['EEEEE-FFFFF'];
    const mutationFn = vi.fn((opts) => opts.onCompleted({ regenerateRecoveryCodes: { recoveryCodes } }));

    regenerateRecoveryCodesService({ code: '111222' }, mutationFn, callback);

    expect(mutationFn.mock.calls[0][0].variables).toEqual({ code: '111222' });
    expect(callback).toHaveBeenCalledWith({
      success: true,
      recoveryCodes,
      toast: { message: 'Recovery Codes Regenerated' }
    });
  });

  it('maps INVALID_MFA_CODE to a retry warning', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onError(new Error('INVALID_MFA_CODE')));

    regenerateRecoveryCodesService({ code: '000000' }, mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'warning', message: 'Invalid code, try again' }
    });
  });
});

describe('adminResetMfaService', () => {
  it('passes the target subdomain and surfaces a success toast', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onCompleted());

    adminResetMfaService('someshow', mutationFn, callback);

    expect(mutationFn.mock.calls[0][0].variables).toEqual({ showSubdomain: 'someshow' });
    expect(callback).toHaveBeenCalledWith({
      success: true,
      toast: { message: 'Two-Factor Authentication Reset' }
    });
  });

  it('maps MFA_NOT_ENABLED to a not-enabled warning', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onError(new Error('MFA_NOT_ENABLED')));

    adminResetMfaService('someshow', mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'warning', message: 'Two-factor authentication is not enabled for that show' }
    });
  });
});
