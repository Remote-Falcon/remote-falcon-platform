/**
 * PRD-019 — viewer geolocation permission state.
 *
 * The viewer page has historically had ZERO knowledge of location permission:
 * `getCurrentPosition` was called with no error callback, so a denial, a
 * dismissal and a slow GPS fix were all indistinguishable from success. That is
 * why ~30% of interactions on GEO shows are rejected with `INVALID_LOCATION`
 * and only 0.8% of rejected viewers ever get through — nothing on the page can
 * tell the viewer (or us) what actually went wrong.
 *
 * Everything here is deliberately pure or thinly-wrapped-async so it can be
 * unit tested. Permission *UI* is browser chrome and jsdom cannot exercise it;
 * this module is the part that can be pinned down in tests, and the rest needs
 * manual per-browser verification.
 */

/** Permission states the page tracks. Mirrors the Permissions API plus our own two. */
export const LocationPermission = {
  /** Nothing observed yet — the load-time call hasn't resolved. */
  UNKNOWN: 'unknown',
  /** Viewer allowed. No recovery UI should render. */
  GRANTED: 'granted',
  /** Never answered, or dismissed. A user-initiated re-prompt WILL resurface the dialog. */
  PROMPT: 'prompt',
  /** Blocked. A re-prompt is inert — the viewer has to change a browser setting. */
  DENIED: 'denied',
  /** No `navigator.geolocation` at all. */
  UNSUPPORTED: 'unsupported',
  /**
   * The call failed and the Permissions API could not tell us whether that was
   * a dismissal or a block.
   *
   * A real state, not a placeholder. Some engines reject the `geolocation`
   * permission name outright, and folding this into DENIED gave a viewer who
   * merely DISMISSED the prompt browser-settings instructions and no button —
   * a dead end, and dismissal is by far the larger population. Treated as
   * recoverable (the retry is offered) while still showing the recovery text,
   * so both populations get something that can work.
   */
  UNCERTAIN: 'uncertain'
};

/**
 * `state` values reported on the `viewer_location_permission` event. Wider than
 * `LocationPermission` because a dismissal and a hard block are the same
 * permission state to the page but very different things to measure: a
 * dismisser is recoverable with one tap, a blocked viewer is not.
 */
export const LocationPermissionEvent = {
  GRANTED: 'granted',
  DENIED: 'denied',
  /** Failed, but we could not tell a dismissal from a block. */
  DENIED_OR_DISMISSED: 'denied_or_dismissed',
  PROMPT_DISMISSED: 'prompt_dismissed',
  TIMEOUT: 'timeout',
  UNAVAILABLE: 'unavailable',
  UNSUPPORTED: 'unsupported'
};

/**
 * `PositionOptions` for every `getCurrentPosition` call.
 *
 * There were none at all before, which meant a hanging GPS fix blocked the
 * request forever with no error and no way out.
 *
 * - `timeout` bounds that wait. 10s is long enough for a cold fix on a phone in
 *   a driveway and short enough that the viewer hasn't given up.
 * - `maximumAge` lets a fix from the last minute satisfy the call outright.
 *   Viewers stand still at a light show, so a cached fix is as good as a new
 *   one and skips a second acquisition on the tap path.
 * - `enableHighAccuracy: false` — the geofence is measured in miles. High
 *   accuracy costs battery and seconds of fix time to buy meters we don't use.
 */
export const GEOLOCATION_POSITION_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 60000
});

/**
 * Reads permission state WITHOUT triggering a prompt.
 *
 * `navigator.permissions.query` is the only way to learn the state passively —
 * calling `getCurrentPosition` to find out is what raises the dialog we're
 * trying to avoid raising twice. Baseline widely-available since Sept 2022, but
 * it still throws on some engines for the `geolocation` name specifically, and
 * in-app webviews lie about it, so every failure path degrades to UNKNOWN
 * rather than guessing.
 *
 * @returns {Promise<string>} a `LocationPermission` value
 */
export const queryLocationPermission = async (nav = typeof navigator === 'undefined' ? undefined : navigator) => {
  if (!nav || !('geolocation' in nav)) {
    return LocationPermission.UNSUPPORTED;
  }
  if (!nav.permissions || typeof nav.permissions.query !== 'function') {
    return LocationPermission.UNKNOWN;
  }
  try {
    const status = await nav.permissions.query({ name: 'geolocation' });
    const state = status?.state;
    if (state === 'granted' || state === 'denied' || state === 'prompt') {
      return state;
    }
    return LocationPermission.UNKNOWN;
  } catch {
    return LocationPermission.UNKNOWN;
  }
};

/**
 * Maps a `GeolocationPositionError` to the permission state and the event state.
 *
 * The subtlety this exists for: a dismissal (X / Esc / tap-away) and a hard
 * Block BOTH surface as `PERMISSION_DENIED`, but they are opposite outcomes for
 * recovery — the dismisser gets the dialog back on a user-initiated retry, the
 * blocked viewer never does. The Permissions API is what separates them, so the
 * caller passes in a freshly-queried state and we defer to it when it disagrees.
 *
 * @param {{code?: number}} error   the GeolocationPositionError
 * @param {string} [queriedState]   result of `queryLocationPermission()` taken AFTER the failure
 * @returns {{permission: string, event: string}}
 */
export const permissionStateFromError = (error, queriedState) => {
  const code = error?.code;

  // TIMEOUT — we asked, nothing came back in time. Says nothing about permission.
  if (code === 3) {
    return {
      permission: queriedState === LocationPermission.DENIED ? LocationPermission.DENIED : LocationPermission.PROMPT,
      event: LocationPermissionEvent.TIMEOUT
    };
  }

  // POSITION_UNAVAILABLE — the device has no fix. Says little about permission,
  // so only mirror what the query actually told us. Inferring GRANTED here
  // recorded never-granted viewers as granted: no recovery UI, and their
  // rejection mislabelled `out_of_range`. When the query is silent, PROMPT is
  // the safe read — it offers a retry, which is the right move for a missing fix.
  if (code === 2) {
    if (queriedState === LocationPermission.DENIED || queriedState === LocationPermission.GRANTED) {
      return { permission: queriedState, event: LocationPermissionEvent.UNAVAILABLE };
    }
    return { permission: LocationPermission.PROMPT, event: LocationPermissionEvent.UNAVAILABLE };
  }

  // PERMISSION_DENIED (code 1) and anything unrecognised. If the query still
  // reports `prompt`, the viewer dismissed rather than blocked and is one tap
  // from recovery — do NOT record them as denied or the recovery UI will show
  // them dead-end instructions.
  if (queriedState === LocationPermission.PROMPT) {
    return { permission: LocationPermission.PROMPT, event: LocationPermissionEvent.PROMPT_DISMISSED };
  }
  if (queriedState === LocationPermission.DENIED) {
    return { permission: LocationPermission.DENIED, event: LocationPermissionEvent.DENIED };
  }
  // The query told us nothing. Do NOT assume a block — see UNCERTAIN.
  return { permission: LocationPermission.UNCERTAIN, event: LocationPermissionEvent.DENIED_OR_DISMISSED };
};

/**
 * Classifies the client for the permission event.
 *
 * In-app webviews are a third of all measured rejections at an 88% rejection
 * rate (Facebook alone), and they fail for a reason no page-level control can
 * fix: the webview inherits location permission from its HOST APP, not from the
 * page. Operators post show links on Facebook, viewers tap them inside the
 * Facebook app, and the distribution channel becomes the failure mode.
 *
 * Recording it here means the split is visible in the funnel before any UI
 * ships. UA sniffing identifies the client but NOT whether the host app holds
 * OS location permission, so this is a population label, not a verdict.
 */
export const clientClassFromUserAgent = (userAgent) => {
  const ua = userAgent || '';
  if (/FBAN|FBAV|FB_IAB|FB4A|FBIOS/.test(ua)) {
    return 'facebook_in_app';
  }
  if (/Instagram/.test(ua)) {
    return 'instagram_in_app';
  }
  return 'browser';
};

/** True for the clients where a page-level re-prompt provably cannot work. */
export const isInAppBrowser = (userAgent) => clientClassFromUserAgent(userAgent) !== 'browser';

/**
 * Promisified `getCurrentPosition`, resolving ONLY once the browser has
 * actually answered.
 *
 * This is the fix for the first-tap failure. The previous inline version was
 * declared `async` around a callback API, so `await` on it returned before any
 * fix existed and the request that followed sent 0.0/0.0. Keeping the wrapper
 * here rather than inline in the component is what makes that behaviour
 * testable at all — the component path needs a real browser.
 *
 * Never rejects: a viewer who denies location is an expected outcome, not an
 * exception, and an unhandled rejection on the tap path would take out the
 * request entirely.
 *
 * @param {object}   [nav]     navigator, injectable for tests
 * @param {Function} [report]  called once with a `LocationPermissionEvent` value
 * @returns {Promise<{permission: string, event: string, coords: {latitude: string, longitude: string} | null}>}
 */
export const acquireViewerLocation = async (nav = typeof navigator === 'undefined' ? undefined : navigator, report = () => {}) => {
  if (!nav || !('geolocation' in nav)) {
    report(LocationPermissionEvent.UNSUPPORTED);
    return { permission: LocationPermission.UNSUPPORTED, event: LocationPermissionEvent.UNSUPPORTED, coords: null };
  }

  return new Promise((resolve) => {
    // getCurrentPosition can throw synchronously (locked-down webviews, some
    // policy-blocked embeds). Inside a Promise executor that becomes a
    // rejection, which contradicts the contract above and would propagate out
    // of the tap handler uncaught — the request would silently do nothing.
    try {
      nav.geolocation.getCurrentPosition(
        (position) => {
          // 5dp is ~1m. The geofence is measured in miles; this is the precision
          // the server has always received and trimming it keeps the payload
          // from carrying more location detail than the check needs.
          const coords = {
            latitude: position.coords.latitude.toFixed(5),
            longitude: position.coords.longitude.toFixed(5)
          };
          report(LocationPermissionEvent.GRANTED);
          resolve({ permission: LocationPermission.GRANTED, event: LocationPermissionEvent.GRANTED, coords });
        },
        (error) => {
          // A dismissal and a hard Block both arrive here as PERMISSION_DENIED.
          // Only the Permissions API separates them, and querying it never raises
          // a prompt, so it is safe to ask on the failure path.
          queryLocationPermission(nav).then((queried) => {
            const { permission, event } = permissionStateFromError(error, queried);
            report(event);
            resolve({ permission, event, coords: null });
          });
        },
        GEOLOCATION_POSITION_OPTIONS
      );
    } catch {
      report(LocationPermissionEvent.UNAVAILABLE);
      resolve({ permission: LocationPermission.UNCERTAIN, event: LocationPermissionEvent.UNAVAILABLE, coords: null });
    }
  });
};
