/**
 * PRD-019 — which recovery affordance a viewer gets, and what it says.
 *
 * Kept separate from the component because the interesting decisions here are
 * all pure: which of three tiers the viewer falls into, and which copy that
 * tier gets. Permission *UI* is browser chrome that jsdom cannot exercise, so
 * this module is the part that can actually be pinned down in tests.
 *
 * The three tiers exist because the measured audience is not homogeneous
 * (2026-08-10, 31 GEO shows, 243 rejections):
 *
 *   ~49%  Chromium 144+   → the native <geolocation> element, which carries its
 *                            own recovery flow for previously-blocked users
 *   ~16%  WebKit / Gecko  → a JS button nested inside <geolocation> as fallback
 *   ~34%  in-app webviews → NEITHER control can work; the permission belongs to
 *                            the host app, so the only real fix is leaving
 */

import { LocationPermission, isInAppBrowser } from './locationPermission';

export const RecoveryTier = {
  /** Render nothing — the viewer can already request. */
  NONE: 'none',
  /** Chromium <geolocation> element, with the JS button nested as fallback. */
  ELEMENT: 'element',
  /** Non-Chromium: our own gesture-initiated re-prompt button. */
  BUTTON: 'button',
  /** Facebook / Instagram webview: tell them to leave, offer the link. */
  IN_APP: 'in_app'
};

/**
 * True for iPhone/iPad Safari proper.
 *
 * Deliberately excludes Chrome (`CriOS`), Firefox (`FxiOS`) and Edge (`EdgiOS`)
 * on iOS. They are all WebKit underneath, but each has its OWN per-site
 * permission UI and inherits location from its own app-level iOS permission, so
 * the "tap aA in the address bar" steps would be actively wrong there — they
 * would send the viewer looking for a control that isn't on their screen.
 */
export const isIosSafari = (userAgent) => {
  const ua = userAgent || '';
  if (!/iPhone|iPad|iPod/.test(ua)) {
    return false;
  }
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) {
    return false;
  }
  return /Safari/.test(ua);
};

/**
 * Picks the tier.
 *
 * `granted` renders nothing — a viewer who allowed location must never see a
 * nag. `unknown` also renders nothing, and that is load-order critical: on page
 * load the state is `prompt` until the viewer answers the dialog the page
 * raised, so rendering on "not granted" would flash the control at EVERY
 * viewer. Gating the first render on the load-time call having resolved is what
 * confines this to sessions that are already broken.
 *
 * @param {string} permission  a `LocationPermission` value
 * @param {string} userAgent
 * @param {boolean} elementSupported  whether `HTMLGeolocationElement` exists
 */
export const recoveryTier = (permission, userAgent, elementSupported) => {
  if (permission === LocationPermission.GRANTED || permission === LocationPermission.UNKNOWN) {
    return RecoveryTier.NONE;
  }
  // Checked BEFORE the element: the Facebook Android webview is Chromium-based
  // and may well report HTMLGeolocationElement, but its recovery flow cannot
  // reach the host app's OS permission, so tier 1 would be a dead end there.
  if (isInAppBrowser(userAgent)) {
    return RecoveryTier.IN_APP;
  }
  if (elementSupported) {
    return RecoveryTier.ELEMENT;
  }
  return RecoveryTier.BUTTON;
};

/**
 * The words for a given tier and permission state.
 *
 * Defaults have to work on a template nobody has touched since 2022, so no copy
 * here depends on the operator having edited anything.
 *
 * @returns {{heading: string, subline?: string, action?: string, steps?: string[], footer?: string}}
 */
export const recoveryCopy = (tier, permission, userAgent) => {
  if (tier === RecoveryTier.IN_APP) {
    return {
      heading: 'Open this page in your browser to request songs',
      subline: "Apps like Facebook and Instagram can't share your location with this page.",
      action: 'Copy link'
    };
  }

  // Tier 1 gets NO recovery instructions even when blocked. The <geolocation>
  // element carries its own recovery flow for exactly this case, and telling a
  // viewer to go hunting for the lock icon while a working recovery button sits
  // directly beneath that sentence is contradictory advice. Chrome's flow is
  // also the better one — it re-grants without the viewer leaving the page.
  if (permission === LocationPermission.DENIED && tier !== RecoveryTier.ELEMENT) {
    // iOS Safari is the only client where the setting is genuinely buried AND
    // the fix is three taps without leaving the page, which is why it is worth
    // spelling out and nothing else is. Measured tier-2 rejections were iOS
    // Safari 22, Firefox desktop 10, Chrome iOS 6 — a per-browser matrix would
    // have been three more blocks serving almost nobody.
    if (isIosSafari(userAgent)) {
      return {
        heading: 'Location is blocked for this site',
        steps: ['Tap aA in the address bar above', 'Tap Website Settings', 'Set Location to Allow'],
        footer: 'Then tap a song again.'
      };
    }
    return {
      heading: 'Location is blocked for this site',
      subline: 'Look for the lock or ⓘ icon next to the web address, open it, and allow Location.'
    };
  }

  // `prompt` — they dismissed, or never answered, or an "Allow Once" expired.
  // A gesture-initiated retry genuinely resurfaces the dialog here.
  return {
    heading: 'Enable location to request songs',
    subline: "This show checks that you're nearby.",
    action: 'Enable location'
  };
};
