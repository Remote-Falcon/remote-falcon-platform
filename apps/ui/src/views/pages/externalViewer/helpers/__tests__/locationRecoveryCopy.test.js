import { describe, expect, it } from 'vitest';

import { LocationPermission } from '../locationPermission';
import { RecoveryTier, isIosSafari, recoveryCopy, recoveryTier } from '../locationRecoveryCopy';

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/151.0.0.0 Mobile/15E148 Safari/604.1',
  iosFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
  firefoxDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0.0.0;]',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0'
};

describe('isIosSafari', () => {
  it('is true for Safari on iPhone', () => {
    expect(isIosSafari(UA.iosSafari)).toBe(true);
  });

  // The "tap aA in the address bar" steps are Safari's UI. Chrome and Firefox
  // on iOS are WebKit too but have their own per-site controls, so showing them
  // Safari's steps sends them hunting for something that isn't on screen.
  it('is false for Chrome on iOS', () => {
    expect(isIosSafari(UA.iosChrome)).toBe(false);
  });

  it('is false for Firefox on iOS', () => {
    expect(isIosSafari(UA.iosFirefox)).toBe(false);
  });

  it('is false for desktop browsers', () => {
    expect(isIosSafari(UA.firefoxDesktop)).toBe(false);
    expect(isIosSafari(UA.chromeAndroid)).toBe(false);
  });
});

describe('recoveryTier', () => {
  it('renders nothing for a viewer who granted location', () => {
    expect(recoveryTier(LocationPermission.GRANTED, UA.chromeAndroid, true)).toBe(RecoveryTier.NONE);
  });

  // Load-order critical: state is `prompt` until the viewer answers the dialog
  // the page itself raised, so rendering before the load-time call resolves
  // would flash the control at EVERY viewer.
  it('renders nothing before the load-time call has resolved', () => {
    expect(recoveryTier(LocationPermission.UNKNOWN, UA.chromeAndroid, true)).toBe(RecoveryTier.NONE);
  });

  it('uses the native element on supporting Chromium', () => {
    expect(recoveryTier(LocationPermission.PROMPT, UA.chromeAndroid, true)).toBe(RecoveryTier.ELEMENT);
  });

  it('falls back to the JS button when the element is unavailable', () => {
    expect(recoveryTier(LocationPermission.PROMPT, UA.iosSafari, false)).toBe(RecoveryTier.BUTTON);
    expect(recoveryTier(LocationPermission.DENIED, UA.firefoxDesktop, false)).toBe(RecoveryTier.BUTTON);
  });

  // The FB Android webview is Chromium and may well report the element, but its
  // recovery flow cannot reach the host app's OS permission. Checking in-app
  // FIRST is what stops tier 1 from being a dead end for a third of rejections.
  it('routes in-app webviews to the in-app tier even when the element exists', () => {
    expect(recoveryTier(LocationPermission.PROMPT, UA.facebookAndroid, true)).toBe(RecoveryTier.IN_APP);
    expect(recoveryTier(LocationPermission.DENIED, UA.instagram, true)).toBe(RecoveryTier.IN_APP);
  });

  it('still renders nothing for an in-app viewer who somehow granted', () => {
    expect(recoveryTier(LocationPermission.GRANTED, UA.facebookAndroid, true)).toBe(RecoveryTier.NONE);
  });
});

describe('recoveryCopy', () => {
  it('offers a re-prompt in the prompt state, where it actually works', () => {
    const copy = recoveryCopy(RecoveryTier.BUTTON, LocationPermission.PROMPT, UA.iosSafari);
    expect(copy.heading).toBe('Enable location to request songs');
    expect(copy.action).toBeTruthy();
  });

  it('gives iOS Safari the exact three-tap steps', () => {
    const copy = recoveryCopy(RecoveryTier.BUTTON, LocationPermission.DENIED, UA.iosSafari);
    expect(copy.steps).toHaveLength(3);
    expect(copy.steps[0]).toContain('aA');
    expect(copy.steps[2]).toContain('Allow');
  });

  // A blocked origin gets PERMISSION_DENIED with no dialog, so a re-prompt
  // control would visibly do nothing — worse than showing no control at all.
  it('offers no re-prompt action in the denied state', () => {
    expect(recoveryCopy(RecoveryTier.BUTTON, LocationPermission.DENIED, UA.iosSafari).action).toBeUndefined();
    expect(recoveryCopy(RecoveryTier.BUTTON, LocationPermission.DENIED, UA.firefoxDesktop).action).toBeUndefined();
  });

  it('gives everything else in tier 2 the generic recovery string', () => {
    const copy = recoveryCopy(RecoveryTier.BUTTON, LocationPermission.DENIED, UA.firefoxDesktop);
    expect(copy.steps).toBeUndefined();
    expect(copy.subline).toContain('lock');
  });

  it('does not give Chrome-on-iOS the Safari steps', () => {
    expect(recoveryCopy(RecoveryTier.BUTTON, LocationPermission.DENIED, UA.iosChrome).steps).toBeUndefined();
  });

  it('gives tier 1 no settings instructions, because the element recovers on its own', () => {
    const copy = recoveryCopy(RecoveryTier.ELEMENT, LocationPermission.DENIED, UA.iosSafari);
    expect(copy.steps).toBeUndefined();
    expect(copy.subline).not.toContain('lock');
    expect(copy.heading).toBe('Enable location to request songs');
  });

  it('tells in-app viewers to leave rather than offering a re-prompt', () => {
    const copy = recoveryCopy(RecoveryTier.IN_APP, LocationPermission.DENIED, UA.facebookAndroid);
    expect(copy.heading).toContain('browser');
    expect(copy.action).toBe('Copy link');
    // Even denied, they get the copy-link action instead of settings steps —
    // no browser setting on their phone can fix a host-app permission.
    expect(copy.steps).toBeUndefined();
  });
});
