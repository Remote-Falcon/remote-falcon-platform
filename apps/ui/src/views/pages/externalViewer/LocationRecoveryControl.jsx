import React, { useCallback, useEffect, useRef, useState } from 'react';

import { trackPosthogEvent } from '../../../utils/analytics/posthog';
import { LocationPermission, clientClassFromUserAgent } from './helpers/locationPermission';
import { RecoveryTier, recoveryCopy, recoveryTier } from './helpers/locationRecoveryCopy';

/**
 * PRD-019 — the inline "your location isn't working, here's what to do" control
 * on the viewer page.
 *
 * Renders NOTHING for a viewer who granted location, and nothing before the
 * load-time permission call has resolved. Everything below only ever reaches a
 * viewer who cannot currently request a song.
 *
 * Three tiers, because the measured audience is not homogeneous — see
 * `locationRecoveryCopy.js` for the split and the numbers behind it.
 */

/**
 * Zero-specificity defaults, so ANY operator selector beats them regardless of
 * where their <style> block lands in the page.
 *
 * `:where()` is what makes "operators can override this entirely" true. Inline
 * styles (the #73 gray-out precedent) would have been simpler but can only be
 * overridden with `!important`, and plain `.rf-location-notice` rules would
 * win-or-lose on document order against operator CSS we don't control.
 *
 * The palette is DERIVED, not chosen. Stock template backgrounds are black,
 * saturated red, a CSS variable, and four of six use a background-image (photos
 * and repeating patterns) — no fixed color reads correctly across all of them.
 * `color-mix` against `currentColor` yields a light wash on dark pages and a
 * dark wash on light ones without knowing the palette at all. Pre-`color-mix`
 * clients degrade to the plain `currentColor` border, still legible.
 *
 * NOT reusing `.failed_Info_Box`: three of six stock templates declare it
 * `position: fixed`/`absolute` and centered, which is right for a message that
 * flashes for six seconds and catastrophic for a persistent control — it would
 * become a modal pinned over the middle of the viewer's screen.
 */
const NOTICE_STYLES = `
:where(.rf-location-notice) {
  color: inherit;
  font: inherit;
  display: block;
  box-sizing: border-box;
  margin: 0.75em auto;
  padding: 0.75em 1em;
  max-width: 32em;
  text-align: center;
  border: 1px solid currentColor;
  border-radius: 0.5em;
}
@supports (background: color-mix(in srgb, currentColor 12%, transparent)) {
  :where(.rf-location-notice) {
    background: color-mix(in srgb, currentColor 12%, transparent);
    border-color: color-mix(in srgb, currentColor 40%, transparent);
    backdrop-filter: blur(6px);
  }
}
:where(.rf-location-notice--inline) {
  margin: 0.5em 0 0;
  padding: 0;
  border: none;
  background: none;
  backdrop-filter: none;
  max-width: none;
}
:where(.rf-location-notice__heading) { font-weight: 600; margin: 0 0 0.25em; }
:where(.rf-location-notice__subline) { opacity: 0.85; font-size: 0.9em; margin: 0 0 0.5em; }
:where(.rf-location-notice__steps) { text-align: left; margin: 0.5em auto; padding-left: 1.5em; }
:where(.rf-location-notice__steps li) { margin: 0.15em 0; }
:where(.rf-location-notice__footer) { font-size: 0.9em; margin: 0.5em 0 0; }
:where(.rf-location-notice__button) {
  color: inherit;
  font: inherit;
  cursor: pointer;
  margin-top: 0.25em;
  padding: 0.5em 1.1em;
  border-radius: 0.4em;
  border: 1px solid currentColor;
  background: transparent;
}
`;

/**
 * The Chromium <geolocation> element (Chrome 144+).
 *
 * Two things about it drive this implementation:
 *
 * 1. In a supporting browser the element renders its OWN browser-defined button
 *    and does NOT render its children; in a non-supporting one it is an
 *    HTMLUnknownElement that renders children normally. Nesting our JS button
 *    inside is therefore the whole tier-1/tier-2 fallback, for free.
 * 2. It fires a `location` event. React 18 does not attach handlers for unknown
 *    `on*` props on unknown elements — it would stringify `onlocation` into an
 *    attribute and silently never fire — so the listener goes on via a ref.
 *
 * Deliberately unstyled. The browser rejects or clamps styling on this element
 * (contrast must be >= 3:1, `opacity` is forced to 1) and DEACTIVATES the button
 * outright on a contrast failure. Our translucent `color-mix` scrim would trip
 * exactly that, so the scrim lives on the wrapper and the element is left alone.
 */
const STYLE_ELEMENT_ID = 'rf-location-notice-styles';

/**
 * Injects the defaults once, into <head>.
 *
 * Rendering a <style> inside the control would re-emit it on every render and
 * put it in the middle of the operator's own markup. Head injection also puts
 * our rules ahead of any operator <style> block in document order, which
 * matters less than it looks — `:where()` already drops them to zero
 * specificity — but costs nothing and keeps the cascade boring.
 */
const useLocationNoticeStyles = (active) => {
  useEffect(() => {
    if (!active || typeof document === 'undefined' || document.getElementById(STYLE_ELEMENT_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = NOTICE_STYLES;
    document.head.appendChild(style);
  }, [active]);
};

const GeolocationElement = ({ onPosition, onError, children }) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return undefined;
    }
    const handler = () => {
      if (el.position?.coords) {
        onPosition(el.position.coords);
      } else if (el.error) {
        onError(el.error);
      }
    };
    el.addEventListener('location', handler);
    return () => el.removeEventListener('location', handler);
  }, [onPosition, onError]);

  return <geolocation ref={ref}>{children}</geolocation>;
};

const LocationRecoveryControl = ({ permission, onRetry, onPosition, variant = 'proactive' }) => {
  // PRD-019 — the `inline` variant lives inside the operator's invalidLocation
  // message block, which is `display: none` until a rejection shows it. It is
  // therefore in the DOM long before anyone can see it, which is why it fires
  // no shown-event: we cannot observe the operator's own visibility toggle, and
  // counting it would inflate the recovery-rate denominator with viewers who
  // never saw a thing.
  const inline = variant === 'inline';
  const [copyState, setCopyState] = useState('idle');
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const elementSupported = typeof window !== 'undefined' && 'HTMLGeolocationElement' in window;
  const tier = recoveryTier(permission, userAgent, elementSupported);

  useLocationNoticeStyles(tier !== RecoveryTier.NONE);

  // Fires once per viewer who actually sees a control. This is the denominator
  // for the recovery rate — "share of viewers who see a control and then reach
  // granted" — against a 0.8% baseline where recovery essentially never happens.
  useEffect(() => {
    if (tier === RecoveryTier.NONE || inline) {
      return;
    }
    trackPosthogEvent('viewer_location_recovery_shown', {
      tier,
      permission,
      client_class: clientClassFromUserAgent(userAgent)
    });
  }, [tier, permission, userAgent, inline]);

  const handleRetry = useCallback(() => {
    trackPosthogEvent('viewer_location_recovery_click', { tier, permission, variant, client_class: clientClassFromUserAgent(userAgent) });
    onRetry();
  }, [onRetry, tier, permission, userAgent, variant]);

  const handleCopyLink = useCallback(async () => {
    trackPosthogEvent('viewer_location_recovery_click', { tier, permission, variant, client_class: clientClassFromUserAgent(userAgent) });
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState('copied');
    } catch {
      // The clipboard is permission-gated too, and an in-app webview is exactly
      // where it is most likely to be blocked or missing. Failing silently would
      // leave the viewer holding a button that does nothing — the precise
      // failure this PRD exists to remove — so fall back to telling them where
      // the address is.
      setCopyState('failed');
    }
  }, [tier, permission, userAgent, variant]);

  if (tier === RecoveryTier.NONE) {
    return null;
  }

  const copy = recoveryCopy(tier, permission, userAgent);

  // Inline sits under copy the operator already wrote ("You are not located
  // where the show is or didn't allow your location to be identified!"), so it
  // drops its own heading and subline in the one case where they say nothing
  // new — the prompt state, where the button label is already the instruction.
  // The denied state keeps them (they ARE the recovery steps), and the in-app
  // tier keeps them (its heading is the only place the viewer is told to leave).
  const redundantInline = inline && tier !== RecoveryTier.IN_APP && permission !== LocationPermission.DENIED;
  // The inline variant already sits inside the operator's themed message box,
  // so it drops our scrim and border rather than drawing a box inside a box.
  const wrapperClass = inline ? 'rf-location-notice rf-location-notice--inline' : 'rf-location-notice';

  const body = (
    <>
      {redundantInline ? null : <div className="rf-location-notice__heading">{copy.heading}</div>}
      {copy.subline && !redundantInline ? <div className="rf-location-notice__subline">{copy.subline}</div> : null}
      {copy.steps ? (
        <ol className="rf-location-notice__steps">
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {copy.footer ? <div className="rf-location-notice__footer">{copy.footer}</div> : null}
    </>
  );

  if (tier === RecoveryTier.IN_APP) {
    return (
      <div className={wrapperClass}>
        {body}
        <button type="button" className="rf-location-notice__button" onClick={handleCopyLink}>
          {copyState === 'copied' ? 'Link copied' : copy.action}
        </button>
        {copyState === 'failed' ? (
          <div className="rf-location-notice__footer">Copy the web address at the top of the screen and paste it into your browser.</div>
        ) : null}
      </div>
    );
  }

  // `denied` in tier 2 gets instructions and NO button: the prompt will not
  // reappear for a blocked origin, so a re-prompt control would be inert. A
  // control that visibly does nothing is worse than no control.
  //
  // Tier 1 still renders the element even when denied — that is precisely the
  // case Chrome's native recovery flow exists for, and it is the only path that
  // can bring a blocked viewer back without them leaving the page.
  const showButton = permission !== LocationPermission.DENIED;
  const fallbackButton = showButton ? (
    <button type="button" className="rf-location-notice__button" onClick={handleRetry}>
      {copy.action}
    </button>
  ) : null;

  return (
    <div className={wrapperClass}>
      {body}
      {tier === RecoveryTier.ELEMENT ? (
        // The element hands us a GeolocationPosition outright, so tier 1 grants
        // location WITHOUT a second getCurrentPosition round trip.
        <GeolocationElement onPosition={onPosition} onError={() => {}}>
          {fallbackButton}
        </GeolocationElement>
      ) : (
        fallbackButton
      )}
    </div>
  );
};

export default LocationRecoveryControl;
