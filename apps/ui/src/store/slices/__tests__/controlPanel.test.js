import { describe, it, expect } from 'vitest';

import reducer, {
  setRemotePrefs,
  setSequences,
  setRemoteViewerPages,
  setRemoteViewerPageTemplates,
  setExternalViewerPageMeta
} from '../controlPanel';

// Plain setter reducers — payload replaces the matching slice key.
// Pinned so a regression in any setter (e.g. accidentally merging instead
// of replacing) doesn't silently corrupt the cached server response.
describe('controlPanel slice reducer', () => {
  const initial = reducer(undefined, { type: '@@INIT' });

  it('starts with empty object slots for each cached fetch', () => {
    expect(initial).toEqual({
      remotePrefs: {},
      sequences: {},
      remoteViewerPages: {},
      remoteViewerPageTemplates: {},
      externalViewerPageMeta: {}
    });
  });

  it.each([
    ['setRemotePrefs', setRemotePrefs, 'remotePrefs'],
    ['setSequences', setSequences, 'sequences'],
    ['setRemoteViewerPages', setRemoteViewerPages, 'remoteViewerPages'],
    ['setRemoteViewerPageTemplates', setRemoteViewerPageTemplates, 'remoteViewerPageTemplates'],
    ['setExternalViewerPageMeta', setExternalViewerPageMeta, 'externalViewerPageMeta']
  ])('%s replaces the %s slot wholesale', (_label, action, key) => {
    const payload = { foo: 'bar', nested: { count: 1 } };
    const next = reducer(initial, action(payload));
    expect(next[key]).toEqual(payload);
    // Other slots untouched.
    for (const otherKey of Object.keys(initial)) {
      if (otherKey !== key) expect(next[otherKey]).toEqual(initial[otherKey]);
    }
  });
});
