import { describe, it, expect, vi } from 'vitest';

import {
  addSequenceToQueueService,
  voteForSequenceService
} from '../mutations.service';

// Pin both viewer-side service contracts. These wrap an Apollo mutation
// fn and invoke a callback with {success, response} or {success, error}.
// A regression that flips the success bool or drops the response object
// breaks the viewer page's "song added" feedback. They also forward the
// anonymous viewerId (PRD A3) so the backend can attribute the request to
// a unique visitor.

const buildMutation = (mode = 'success') =>
  vi.fn((opts) => {
    if (mode === 'success') {
      opts.onCompleted({ ok: true });
    } else {
      opts.onError(new Error('boom'));
    }
  });

describe('addSequenceToQueueService', () => {
  it('passes parsed-float coordinates, viewerId, and routes to Viewer', () => {
    const mutation = buildMutation('success');
    const callback = vi.fn();
    addSequenceToQueueService(mutation, 'mattshow', 'Carol', '12.34', '-56.78', 'viewer-abc', callback);
    expect(mutation).toHaveBeenCalledTimes(1);
    const opts = mutation.mock.calls[0][0];
    expect(opts.context.headers.Route).toBe('Viewer');
    expect(opts.variables).toEqual({
      showSubdomain: 'mattshow',
      name: 'Carol',
      latitude: 12.34,
      longitude: -56.78,
      viewerId: 'viewer-abc'
    });
  });

  it('forwards a null viewerId unchanged (localStorage blocked)', () => {
    const mutation = buildMutation('success');
    addSequenceToQueueService(mutation, 's', 'n', '0', '0', null, vi.fn());
    expect(mutation.mock.calls[0][0].variables.viewerId).toBeNull();
  });

  it('invokes callback with {success:true, response} on completion', () => {
    const callback = vi.fn();
    addSequenceToQueueService(buildMutation('success'), 's', 'n', '0', '0', 'viewer-abc', callback);
    expect(callback).toHaveBeenCalledWith({ success: true, response: { ok: true } });
  });

  it('invokes callback with {success:false, error} on error', () => {
    const callback = vi.fn();
    addSequenceToQueueService(buildMutation('error'), 's', 'n', '0', '0', 'viewer-abc', callback);
    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({ message: 'boom' })
    });
  });
});

describe('voteForSequenceService', () => {
  it('routes to Viewer with parsed coordinates and viewerId', () => {
    const mutation = buildMutation('success');
    voteForSequenceService(mutation, 'mattshow', 'Carol', '12', '-34', 'viewer-abc', () => {});
    const opts = mutation.mock.calls[0][0];
    expect(opts.variables).toEqual({
      showSubdomain: 'mattshow',
      name: 'Carol',
      latitude: 12,
      longitude: -34,
      viewerId: 'viewer-abc'
    });
    expect(opts.context.headers.Route).toBe('Viewer');
  });

  it('callback receives {success:true, response} on completion', () => {
    const callback = vi.fn();
    voteForSequenceService(buildMutation('success'), 's', 'n', '0', '0', 'viewer-abc', callback);
    expect(callback).toHaveBeenCalledWith({ success: true, response: { ok: true } });
  });

  it('callback receives {success:false, error} on error', () => {
    const callback = vi.fn();
    voteForSequenceService(buildMutation('error'), 's', 'n', '0', '0', 'viewer-abc', callback);
    expect(callback.mock.calls[0][0].success).toBe(false);
    expect(callback.mock.calls[0][0].error).toBeInstanceOf(Error);
  });
});
