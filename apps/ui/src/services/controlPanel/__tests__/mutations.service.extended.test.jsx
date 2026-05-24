import { describe, it, expect, vi } from 'vitest';

import {
  deleteAccountService,
  playSequenceFromControlPanelService,
  savePagesService,
  savePreferencesService,
  savePsaSequencesService,
  saveSequencesService,
  saveSequenceGroupsService,
  saveShowService,
  saveUserProfileService,
  updatePasswordService
} from '../mutations.service';
import { StatusResponse } from '../../../utils/enum';

// These wrappers all follow the same Apollo callback pattern:
//   mutation({ context, variables, onCompleted, onError })
//   → callback({ success, toast, [payload] })
// Pinning every one because a typo in any toast.message or success flag
// is silent in development — the UI just shows the wrong text/colour.

const mockMutation = (mode = 'success', data = {}) =>
  vi.fn((opts) => {
    if (mode === 'success') opts.onCompleted(data);
    else opts.onError(typeof data === 'string' ? new Error(data) : new Error('boom'));
  });

describe('deleteAccountService', () => {
  it('returns success:true on completion', () => {
    const cb = vi.fn();
    deleteAccountService(mockMutation('success'), cb);
    expect(cb).toHaveBeenCalledWith({ success: true });
  });
  it('returns success:false with error toast on failure', () => {
    const cb = vi.fn();
    deleteAccountService(mockMutation('error'), cb);
    expect(cb).toHaveBeenCalledWith({ success: false, toast: { alert: 'error' } });
  });
});

describe('playSequenceFromControlPanelService', () => {
  it('passes the sequence and toasts with the name on success', () => {
    const cb = vi.fn();
    const mutation = mockMutation('success');
    playSequenceFromControlPanelService({ name: 'Carol of the Bells' }, mutation, cb);
    expect(mutation.mock.calls[0][0].variables).toEqual({ sequence: { name: 'Carol of the Bells' } });
    expect(cb).toHaveBeenCalledWith({
      success: true,
      toast: { message: 'Carol of the Bells Playing Next' }
    });
  });

  it('warns the user when the gateway returns OWNER_REQUESTED', () => {
    const cb = vi.fn();
    playSequenceFromControlPanelService(
      { name: 'X' },
      mockMutation('error', StatusResponse.OWNER_REQUESTED),
      cb
    );
    expect(cb).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'warning', message: 'You have already requested a sequence' }
    });
  });

  it('falls back to a generic error toast on any other failure', () => {
    const cb = vi.fn();
    playSequenceFromControlPanelService({ name: 'X' }, mockMutation('error', 'something else'), cb);
    expect(cb).toHaveBeenCalledWith({ success: false, toast: { alert: 'error' } });
  });
});

describe('save* services follow the (variables → toast) contract', () => {
  it.each([
    ['savePages', savePagesService, [{ id: 1 }], 'pages', 'Viewer Pages Saved'],
    ['savePsaSequences', savePsaSequencesService, [{ id: 1 }], 'psaSequences', 'Viewer Settings Saved'],
    ['saveSequences', saveSequencesService, [{ id: 1 }], 'sequences', 'Sequences Saved'],
    ['saveSequenceGroups', saveSequenceGroupsService, [{ id: 1 }], 'sequenceGroups', 'Sequence Group Saved']
  ])('%s wraps payload + toasts success message', (_n, svc, payload, key, msg) => {
    const cb = vi.fn();
    const mutation = mockMutation('success');
    svc(payload, mutation, cb);
    expect(mutation.mock.calls[0][0].variables[key]).toEqual(payload);
    expect(cb).toHaveBeenCalledWith({ success: true, toast: { message: msg } });
  });

  it.each([
    ['savePages', savePagesService],
    ['savePreferences', savePreferencesService],
    ['savePsaSequences', savePsaSequencesService],
    ['saveSequences', saveSequencesService],
    ['saveSequenceGroups', saveSequenceGroupsService],
    ['saveUserProfile', saveUserProfileService]
  ])('%s surfaces a generic error toast on failure', (_n, svc) => {
    const cb = vi.fn();
    svc({}, mockMutation('error'), cb);
    expect(cb).toHaveBeenCalledWith({ success: false, toast: { alert: 'error' } });
  });
});

describe('savePreferencesService', () => {
  it('spreads the preferences object into variables.preferences', () => {
    const cb = vi.fn();
    const mutation = mockMutation('success');
    savePreferencesService({ jukeboxEnabled: true, votingEnabled: false }, mutation, cb);
    expect(mutation.mock.calls[0][0].variables).toEqual({
      preferences: { jukeboxEnabled: true, votingEnabled: false }
    });
    expect(cb).toHaveBeenCalledWith({ success: true, toast: { message: 'Viewer Settings Saved' } });
  });
});

describe('saveShowService', () => {
  it('passes email + showName and toasts success', () => {
    const cb = vi.fn();
    const mutation = mockMutation('success');
    saveShowService({ email: 'a@b.com', showName: 'My Show' }, mutation, cb);
    expect(mutation.mock.calls[0][0].variables).toEqual({ email: 'a@b.com', showName: 'My Show' });
    expect(cb).toHaveBeenCalledWith({ success: true, toast: { message: 'User Profile Saved' } });
  });

  it('warns about duplicate show/email when gateway returns SHOW_EXISTS', () => {
    const cb = vi.fn();
    saveShowService({}, mockMutation('error', StatusResponse.SHOW_EXISTS), cb);
    expect(cb).toHaveBeenCalledWith({
      success: false,
      toast: { message: 'That email or show name already exists', alert: 'error' }
    });
  });
});

describe('saveUserProfileService', () => {
  it('picks only the documented fields into variables.userProfile', () => {
    const cb = vi.fn();
    const mutation = mockMutation('success');
    saveUserProfileService(
      {
        firstName: 'Matt',
        lastName: 'Shorts',
        facebookUrl: 'fb',
        youtubeUrl: 'yt',
        // not picked
        secret: 'no'
      },
      mutation,
      cb
    );
    expect(mutation.mock.calls[0][0].variables.userProfile).toEqual({
      firstName: 'Matt',
      lastName: 'Shorts',
      facebookUrl: 'fb',
      youtubeUrl: 'yt'
    });
    expect(cb).toHaveBeenCalledWith({ success: true, toast: { message: 'User Profile Saved' } });
  });
});

describe('updatePasswordService', () => {
  it('base64-encodes both passwords into header values', () => {
    const cb = vi.fn();
    const mutation = mockMutation('success');
    updatePasswordService('old-pw', 'new-pw', mutation, cb);
    const headers = mutation.mock.calls[0][0].context.headers;
    expect(headers.Password).toBe(Buffer.from('old-pw', 'binary').toString('base64'));
    expect(headers.NewPassword).toBe(Buffer.from('new-pw', 'binary').toString('base64'));
    expect(headers.Route).toBe('Control-Panel');
    expect(cb).toHaveBeenCalledWith({ success: true });
  });

  it('surfaces a "Failed to Update Password" toast on rejection', () => {
    const cb = vi.fn();
    updatePasswordService('a', 'b', mockMutation('error'), cb);
    expect(cb).toHaveBeenCalledWith({
      success: false,
      toast: { alert: 'error', message: 'Failed to Update Password' }
    });
  });
});
