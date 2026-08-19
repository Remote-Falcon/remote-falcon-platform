import { describe, expect, it } from 'vitest';

import {
  GEOLOCATION_POSITION_OPTIONS,
  acquireViewerLocation,
  LocationPermission,
  LocationPermissionEvent,
  clientClassFromUserAgent,
  isInAppBrowser,
  permissionStateFromError,
  queryLocationPermission
} from '../locationPermission';

const PERMISSION_DENIED = { code: 1 };
const POSITION_UNAVAILABLE = { code: 2 };
const TIMEOUT = { code: 3 };

describe('GEOLOCATION_POSITION_OPTIONS', () => {
  it('bounds the wait so a hanging GPS fix cannot block a request forever', () => {
    expect(GEOLOCATION_POSITION_OPTIONS.timeout).toBeGreaterThan(0);
    expect(GEOLOCATION_POSITION_OPTIONS.timeout).toBeLessThanOrEqual(15000);
  });

  it('accepts a recent cached fix so the tap path does not re-acquire', () => {
    expect(GEOLOCATION_POSITION_OPTIONS.maximumAge).toBeGreaterThan(0);
  });

  it('does not pay for high accuracy the geofence does not use', () => {
    expect(GEOLOCATION_POSITION_OPTIONS.enableHighAccuracy).toBe(false);
  });
});

describe('permissionStateFromError', () => {
  // The crux of PRD-019: a dismissal and a hard Block are the SAME error code
  // but opposite outcomes for recovery.
  it('treats PERMISSION_DENIED as a dismissal when the query still says prompt', () => {
    expect(permissionStateFromError(PERMISSION_DENIED, LocationPermission.PROMPT)).toEqual({
      permission: LocationPermission.PROMPT,
      event: LocationPermissionEvent.PROMPT_DISMISSED
    });
  });

  it('treats PERMISSION_DENIED as a block when the query agrees', () => {
    expect(permissionStateFromError(PERMISSION_DENIED, LocationPermission.DENIED)).toEqual({
      permission: LocationPermission.DENIED,
      event: LocationPermissionEvent.DENIED
    });
  });

  // Review finding: this used to collapse to DENIED, and the control suppresses
  // the retry button on DENIED. On engines that reject the `geolocation`
  // permission name, a viewer who merely DISMISSED got browser-settings
  // instructions and no button — the exact dead end this module exists to
  // avoid, for the larger of the two populations.
  it('does NOT assume a block when the permissions query told us nothing', () => {
    expect(permissionStateFromError(PERMISSION_DENIED, LocationPermission.UNKNOWN)).toEqual({
      permission: LocationPermission.UNCERTAIN,
      event: LocationPermissionEvent.DENIED_OR_DISMISSED
    });
  });

  it('reports a timeout as recoverable, not denied', () => {
    // A timeout says nothing about permission. Recording it as `denied` would
    // show a slow-GPS viewer browser-settings instructions they do not need.
    expect(permissionStateFromError(TIMEOUT, LocationPermission.PROMPT)).toEqual({
      permission: LocationPermission.PROMPT,
      event: LocationPermissionEvent.TIMEOUT
    });
  });

  it('still respects a hard block that surfaced as a timeout', () => {
    expect(permissionStateFromError(TIMEOUT, LocationPermission.DENIED).permission).toBe(LocationPermission.DENIED);
  });

  it('keeps POSITION_UNAVAILABLE as granted when the query confirms it', () => {
    expect(permissionStateFromError(POSITION_UNAVAILABLE, LocationPermission.GRANTED)).toEqual({
      permission: LocationPermission.GRANTED,
      event: LocationPermissionEvent.UNAVAILABLE
    });
  });

  // Review finding: POSITION_UNAVAILABLE used to INFER granted. A never-granted
  // viewer was recorded as granted, got no recovery UI at all, and had their
  // rejection mislabelled `out_of_range` in the funnel.
  it('does not infer granted from POSITION_UNAVAILABLE on an unknown query', () => {
    const result = permissionStateFromError(POSITION_UNAVAILABLE, LocationPermission.UNKNOWN);
    expect(result.permission).not.toBe(LocationPermission.GRANTED);
    expect(result.permission).toBe(LocationPermission.PROMPT);
  });

  it('handles an error with no code at all', () => {
    expect(permissionStateFromError(undefined, LocationPermission.PROMPT).event).toBe(LocationPermissionEvent.PROMPT_DISMISSED);
  });
});

describe('queryLocationPermission', () => {
  it('reports unsupported when there is no geolocation at all', async () => {
    await expect(queryLocationPermission({})).resolves.toBe(LocationPermission.UNSUPPORTED);
  });

  it('reports unknown when the Permissions API is missing', async () => {
    await expect(queryLocationPermission({ geolocation: {} })).resolves.toBe(LocationPermission.UNKNOWN);
  });

  it('passes through granted / prompt / denied', async () => {
    for (const state of ['granted', 'prompt', 'denied']) {
      const nav = { geolocation: {}, permissions: { query: async () => ({ state }) } };
      await expect(queryLocationPermission(nav)).resolves.toBe(state);
    }
  });

  it('degrades to unknown when the query throws', async () => {
    // Some engines reject the `geolocation` permission name outright.
    const nav = {
      geolocation: {},
      permissions: {
        query: async () => {
          throw new TypeError('unsupported permission name');
        }
      }
    };
    await expect(queryLocationPermission(nav)).resolves.toBe(LocationPermission.UNKNOWN);
  });

  it('degrades to unknown on an unrecognised state rather than guessing', async () => {
    const nav = { geolocation: {}, permissions: { query: async () => ({ state: 'something-new' }) } };
    await expect(queryLocationPermission(nav)).resolves.toBe(LocationPermission.UNKNOWN);
  });
});

describe('clientClassFromUserAgent', () => {
  // Real user agents from the 2026-08-10 rejection sample.
  it('detects the Facebook Android in-app browser', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0.0.0;]';
    expect(clientClassFromUserAgent(ua)).toBe('facebook_in_app');
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it('detects the Facebook iOS in-app browser', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/500.0;]';
    expect(clientClassFromUserAgent(ua)).toBe('facebook_in_app');
  });

  it('detects the Instagram in-app browser', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0';
    expect(clientClassFromUserAgent(ua)).toBe('instagram_in_app');
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it('does not misclassify ordinary Chrome on Android', () => {
    // Regular Chrome on Android had 45 interactions and ZERO rejections in the
    // same window — it is the webview that fails, not the OS. Misclassifying it
    // would hide the real signal.
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
    expect(clientClassFromUserAgent(ua)).toBe('browser');
    expect(isInAppBrowser(ua)).toBe(false);
  });

  it('does not misclassify Safari on iOS', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1';
    expect(clientClassFromUserAgent(ua)).toBe('browser');
  });

  it('handles a missing user agent', () => {
    expect(clientClassFromUserAgent(undefined)).toBe('browser');
  });
});

describe('acquireViewerLocation', () => {
  const navWith = (getCurrentPosition, permissionState = 'prompt') => ({
    geolocation: { getCurrentPosition },
    permissions: { query: async () => ({ state: permissionState }) }
  });

  // THE regression guard for PRD-019's prerequisite bug. The old
  // implementation was `async` wrapped around a callback API, so it resolved
  // before the browser had answered and the request that followed sent
  // 0.0/0.0. Any change that reintroduces that fails here.
  it('does not resolve until the browser has actually returned a fix', async () => {
    let fire;
    const nav = navWith((success) => {
      fire = () => success({ coords: { latitude: 35.123456, longitude: -80.987654 } });
    });

    let settled = false;
    const pending = acquireViewerLocation(nav).then((result) => {
      settled = true;
      return result;
    });

    // Give the microtask queue every chance to settle it early.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    fire();
    const result = await pending;
    expect(settled).toBe(true);
    expect(result.coords).toEqual({ latitude: '35.12346', longitude: '-80.98765' });
    expect(result.permission).toBe(LocationPermission.GRANTED);
  });

  it('passes the bounded PositionOptions through', async () => {
    let seen;
    const nav = navWith((success, _error, options) => {
      seen = options;
      success({ coords: { latitude: 1, longitude: 2 } });
    });
    await acquireViewerLocation(nav);
    expect(seen).toEqual(GEOLOCATION_POSITION_OPTIONS);
  });

  it('resolves with no coords rather than throwing when the viewer denies', async () => {
    // An unhandled rejection here would take out the whole request path, and a
    // denial is an expected outcome, not an exception.
    const nav = navWith((_success, error) => error(PERMISSION_DENIED), 'denied');
    const result = await acquireViewerLocation(nav);
    expect(result.coords).toBeNull();
    expect(result.permission).toBe(LocationPermission.DENIED);
    expect(result.event).toBe(LocationPermissionEvent.DENIED);
  });

  it('reports a dismissal as recoverable, not as a block', async () => {
    const nav = navWith((_success, error) => error(PERMISSION_DENIED), 'prompt');
    const result = await acquireViewerLocation(nav);
    expect(result.permission).toBe(LocationPermission.PROMPT);
    expect(result.event).toBe(LocationPermissionEvent.PROMPT_DISMISSED);
  });

  it('resolves on a timeout instead of hanging the request forever', async () => {
    const nav = navWith((_success, error) => error(TIMEOUT), 'prompt');
    const result = await acquireViewerLocation(nav);
    expect(result.event).toBe(LocationPermissionEvent.TIMEOUT);
    expect(result.coords).toBeNull();
  });

  it('reports exactly one event per acquisition', async () => {
    const seen = [];
    const nav = navWith((success) => success({ coords: { latitude: 1, longitude: 2 } }));
    await acquireViewerLocation(nav, (state) => seen.push(state));
    expect(seen).toEqual([LocationPermissionEvent.GRANTED]);
  });

  // Review finding: getCurrentPosition can throw synchronously in locked-down
  // webviews. Inside a Promise executor that is a rejection, which contradicts
  // the documented contract and would propagate out of the tap handler uncaught
  // — the request would silently do nothing at all.
  it('never rejects, even when getCurrentPosition throws synchronously', async () => {
    const nav = {
      geolocation: {
        getCurrentPosition: () => {
          throw new Error('blocked by permissions policy');
        }
      },
      permissions: { query: async () => ({ state: 'prompt' }) }
    };
    const result = await acquireViewerLocation(nav);
    expect(result.coords).toBeNull();
    expect(result.permission).toBe(LocationPermission.UNCERTAIN);
  });

  it('reports unsupported without touching geolocation when there is none', async () => {
    const seen = [];
    const result = await acquireViewerLocation({}, (state) => seen.push(state));
    expect(result).toEqual({
      permission: LocationPermission.UNSUPPORTED,
      event: LocationPermissionEvent.UNSUPPORTED,
      coords: null
    });
    expect(seen).toEqual([LocationPermissionEvent.UNSUPPORTED]);
  });
});
