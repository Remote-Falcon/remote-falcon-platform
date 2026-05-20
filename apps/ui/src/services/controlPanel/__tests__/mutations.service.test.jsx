import { describe, it, expect, vi } from 'vitest';

import { refreshApiSecretService, requestApiAccessService } from '../mutations.service';

// These tests pin the callback contract that Account.jsx relies on:
// - success path passes through the mutation payload (secretKey / apiAccess)
//   so the UI can render the freshly minted secret without refetching.
// - error path surfaces a single 'error' toast — no per-error-code branching
//   (the old API_ACCESS_REQUESTED warning branch was dead now that the UI
//   hides the request button once apiAccessActive is true).

describe('refreshApiSecretService', () => {
  it('invokes the callback with secretKey + success toast on completion', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => {
      opts.onCompleted({ refreshApiSecret: 'new-secret-20chars-xx' });
    });

    refreshApiSecretService(mutationFn, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      success: true,
      secretKey: 'new-secret-20chars-xx',
      toast: { message: 'API Secret Key Refreshed' }
    });
  });

  it('surfaces an error toast when the mutation fails', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => {
      opts.onError(new Error('boom'));
    });

    refreshApiSecretService(mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'error', message: 'Failed to refresh API Secret Key' }
    });
  });

  it('refetches GET_SHOW so apiAccessActive + token stay in sync after rotation', () => {
    const callback = vi.fn();
    const mutationFn = vi.fn((opts) => opts.onCompleted({ refreshApiSecret: 'x' }));

    refreshApiSecretService(mutationFn, callback);

    const opts = mutationFn.mock.calls[0][0];
    expect(opts.refetchQueries).toHaveLength(1);
    expect(opts.refetchQueries[0]).toMatchObject({ awaitRefetchQueries: true });
  });
});

describe('requestApiAccessService', () => {
  it('passes the newly minted ApiAccess payload through to the callback', () => {
    const callback = vi.fn();
    const apiAccess = { apiAccessActive: true, apiAccessToken: 'tok', apiAccessSecret: 'sec' };
    const mutationFn = vi.fn((opts) => opts.onCompleted({ requestApiAccess: apiAccess }));

    requestApiAccessService(mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: true,
      apiAccess,
      toast: { message: 'API Access Requested' }
    });
  });

  it('returns a plain error toast — no special-cased API_ACCESS_REQUESTED branch', () => {
    // The UI hides the Request Access button once apiAccessActive is true,
    // so the backend's API_ACCESS_REQUESTED status is unreachable from
    // this flow. The handler should not branch on it.
    const callback = vi.fn();
    const error = new Error('API_ACCESS_REQUESTED');
    const mutationFn = vi.fn((opts) => opts.onError(error));

    requestApiAccessService(mutationFn, callback);

    expect(callback).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'error' }
    });
  });
});
