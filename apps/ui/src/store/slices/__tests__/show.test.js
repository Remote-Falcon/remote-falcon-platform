import { describe, it, expect } from 'vitest';

import reducer, {
  startLoginAction,
  startLogoutAction,
  startFetchShowAction,
  setShow
} from '../show';

// The `show` slice is the auth+profile spine for the entire control panel.
// AuthGuard inspects `isLoggedIn`/`isInitialized` on every route change,
// and dozens of selectors read `show` to render branding/timezone/etc.
// These tests pin the reducer contract so a regression in any action
// shape can't silently break login or log everyone out.

describe('show slice reducer', () => {
  const initial = reducer(undefined, { type: '@@INIT' });

  it('returns the documented initial state', () => {
    expect(initial).toEqual({
      isLoggedIn: false,
      isInitialized: false,
      isDemo: false,
      show: null
    });
  });

  it('startLoginAction flips isLoggedIn/isInitialized and stores the show', () => {
    const showPayload = { showSubdomain: 'matt', email: 'm@example.com' };
    const next = reducer(initial, startLoginAction(showPayload));
    expect(next.isLoggedIn).toBe(true);
    expect(next.isInitialized).toBe(true);
    expect(next.show).toEqual(showPayload);
  });

  it('startLogoutAction clears the show and isLoggedIn but keeps isInitialized', () => {
    const loggedIn = reducer(initial, startLoginAction({ showSubdomain: 'x' }));
    const next = reducer(loggedIn, startLogoutAction());
    expect(next.isLoggedIn).toBe(false);
    expect(next.isInitialized).toBe(true);
    expect(next.show).toBeNull();
  });

  it('startFetchShowAction updates show but does not touch auth flags', () => {
    const loggedIn = reducer(initial, startLoginAction({ showSubdomain: 'a' }));
    const next = reducer(loggedIn, startFetchShowAction({ show: { showSubdomain: 'b' } }));
    expect(next.show).toEqual({ showSubdomain: 'b' });
    expect(next.isLoggedIn).toBe(true);
  });

  it('setShow replaces show directly with the payload', () => {
    const next = reducer(initial, setShow({ showSubdomain: 'direct', timezone: 'UTC' }));
    expect(next.show).toEqual({ showSubdomain: 'direct', timezone: 'UTC' });
  });

  it('startLoginAction tolerates an undefined payload', () => {
    const next = reducer(initial, { type: startLoginAction.type });
    expect(next.isLoggedIn).toBe(true);
    expect(next.show).toBeUndefined();
  });
});
