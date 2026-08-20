import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LocationRecoveryControl from '../LocationRecoveryControl';
import { LocationPermission } from '../helpers/locationPermission';

vi.mock('../../../../utils/analytics/posthog', () => ({ trackPosthogEvent: vi.fn() }));
// eslint-disable-next-line import/first
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
const IOS_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1';
const FACEBOOK =
  'Mozilla/5.0 (Linux; Android 14; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;]';

const setUserAgent = (ua) => {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
};

const setElementSupport = (supported) => {
  if (supported) {
    window.HTMLGeolocationElement = function HTMLGeolocationElement() {};
  } else {
    delete window.HTMLGeolocationElement;
  }
};

describe('LocationRecoveryControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUserAgent(CHROME_ANDROID);
    setElementSupport(false);
    document.getElementById('rf-location-notice-styles')?.remove();
  });

  afterEach(() => {
    delete window.HTMLGeolocationElement;
  });

  // The single most important assertion in this file: a viewer who allowed
  // location must never see a nag, and neither must one whose load-time call
  // hasn't resolved (state is `prompt` until they answer that dialog).
  it('renders nothing when permission is granted', () => {
    const { container } = render(<LocationRecoveryControl permission={LocationPermission.GRANTED} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the load-time call resolves', () => {
    const { container } = render(<LocationRecoveryControl permission={LocationPermission.UNKNOWN} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the client has no geolocation at all', () => {
    const { container } = render(<LocationRecoveryControl permission={LocationPermission.UNSUPPORTED} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a working retry when the state is uncertain, not a dead end', () => {
    const onRetry = vi.fn();
    render(<LocationRecoveryControl permission={LocationPermission.UNCERTAIN} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enable location' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not inject its stylesheet when it renders nothing', () => {
    render(<LocationRecoveryControl permission={LocationPermission.GRANTED} onRetry={vi.fn()} />);
    expect(document.getElementById('rf-location-notice-styles')).toBeNull();
  });

  describe('tier 2 — JS fallback button', () => {
    it('offers a re-prompt in the prompt state and calls back on tap', () => {
      const onRetry = vi.fn();
      render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={onRetry} />);
      fireEvent.click(screen.getByRole('button', { name: 'Enable location' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    // A blocked origin gets PERMISSION_DENIED with no dialog. A button here
    // would visibly do nothing, which is worse than showing no button.
    it('shows NO button in the denied state', () => {
      render(<LocationRecoveryControl permission={LocationPermission.DENIED} onRetry={vi.fn()} />);
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByText('Location is blocked for this site')).toBeTruthy();
    });

    it('gives iOS Safari the exact three-tap steps', () => {
      setUserAgent(IOS_SAFARI);
      render(<LocationRecoveryControl permission={LocationPermission.DENIED} onRetry={vi.fn()} />);
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      expect(screen.getByText(/Website Settings/)).toBeTruthy();
    });

    it('gives everyone else the generic string, not the Safari steps', () => {
      render(<LocationRecoveryControl permission={LocationPermission.DENIED} onRetry={vi.fn()} />);
      expect(screen.queryByRole('listitem')).toBeNull();
    });

    it('injects its zero-specificity defaults once', () => {
      const { rerender } = render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      rerender(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      const styles = document.querySelectorAll('#rf-location-notice-styles');
      expect(styles).toHaveLength(1);
      // `:where()` is what makes the operator override in the PRD actually true.
      expect(styles[0].textContent).toContain(':where(.rf-location-notice)');
      // Must not reuse .failed_Info_Box — three of six stock templates make it
      // a fixed, centered overlay, which would pin this over the viewer's screen.
      expect(styles[0].textContent).not.toContain('failed_Info_Box');
    });
  });

  describe('tier 1 — native <geolocation> element', () => {
    beforeEach(() => setElementSupport(true));

    it('renders the element with the JS button nested as fallback', () => {
      const { container } = render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      const element = container.querySelector('geolocation');
      expect(element).toBeTruthy();
      // Supporting browsers hide these children and draw their own button;
      // non-supporting ones render them. That nesting IS the tier 1/2 fallback.
      expect(element.querySelector('button')).toBeTruthy();
    });

    // Chrome's native recovery flow is the ONLY path that brings a blocked
    // viewer back without leaving the page, so tier 1 keeps rendering when denied.
    it('still renders the element when denied, unlike tier 2', () => {
      const { container } = render(<LocationRecoveryControl permission={LocationPermission.DENIED} onRetry={vi.fn()} />);
      expect(container.querySelector('geolocation')).toBeTruthy();
      expect(container.querySelector('geolocation button')).toBeNull();
    });

    it('reads coordinates off the element rather than re-acquiring them', () => {
      const onPosition = vi.fn();
      const onRetry = vi.fn();
      const { container } = render(
        <LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={onRetry} onPosition={onPosition} />
      );
      const element = container.querySelector('geolocation');
      element.position = { coords: { latitude: 35.1, longitude: -80.9 } };
      // React 18 stringifies unknown `on*` props on unknown elements, so the
      // handler is attached via addEventListener. A regression to `onlocation`
      // as a prop fails right here.
      fireEvent(element, new Event('location'));
      expect(onPosition).toHaveBeenCalledWith({ latitude: 35.1, longitude: -80.9 });
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('does not call back when the element reports an error', () => {
      const onPosition = vi.fn();
      const { container } = render(
        <LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} onPosition={onPosition} />
      );
      const element = container.querySelector('geolocation');
      element.error = { code: 1 };
      fireEvent(element, new Event('location'));
      expect(onPosition).not.toHaveBeenCalled();
    });
  });

  describe('tier 3 — in-app webview', () => {
    beforeEach(() => setUserAgent(FACEBOOK));

    it('tells the viewer to leave instead of offering a re-prompt', () => {
      const onRetry = vi.fn();
      render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={onRetry} />);
      expect(screen.getByText(/Open this page in your browser/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Enable location' })).toBeNull();
    });

    it('never renders the native element, even though the FB webview is Chromium', () => {
      setElementSupport(true);
      const { container } = render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      expect(container.querySelector('geolocation')).toBeNull();
    });

    it('confirms the copy so the viewer knows the tap did something', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
      render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      expect(writeText).toHaveBeenCalledWith(window.location.href);
      expect(await screen.findByRole('button', { name: 'Link copied' })).toBeTruthy();
    });

    it('does not claim success when the clipboard is unavailable', async () => {
      // Clipboard is permission-gated too, and in-app webviews are exactly where
      // it is most likely to be blocked.
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));
      Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
      render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: 'Link copied' })).toBeNull();
      // A button that visibly does nothing is the failure this PRD removes —
      // so the viewer gets a manual route instead.
      expect(await screen.findByText(/Copy the web address/)).toBeTruthy();
    });
  });

  describe('inline variant (inside the invalidLocation message)', () => {
    it('drops copy the operator message already supplies, keeping the action', () => {
      render(<LocationRecoveryControl variant="inline" permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      expect(screen.queryByText('Enable location to request songs')).toBeNull();
      expect(screen.queryByText(/checks that you're nearby/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Enable location' })).toBeTruthy();
    });

    // The denied-state text IS the recovery instruction, not a restatement of
    // the operator's message — dropping it would leave a dead end.
    it('keeps the denied-state heading and steps', () => {
      setUserAgent(IOS_SAFARI);
      render(<LocationRecoveryControl variant="inline" permission={LocationPermission.DENIED} onRetry={vi.fn()} />);
      expect(screen.getByText('Location is blocked for this site')).toBeTruthy();
    });

    // Its heading is the only place an in-app viewer is told to leave.
    it('keeps the in-app heading and explanation', () => {
      setUserAgent(FACEBOOK);
      render(<LocationRecoveryControl variant="inline" permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      expect(screen.getByText(/Open this page in your browser/)).toBeTruthy();
      expect(screen.getByText(/Facebook and Instagram/)).toBeTruthy();
    });

    // It sits inside the operator's themed .failed_Info_Box. Drawing our own
    // scrim there would be a box inside a box.
    it('drops the wrapper box', () => {
      const { container } = render(
        <LocationRecoveryControl variant="inline" permission={LocationPermission.PROMPT} onRetry={vi.fn()} />
      );
      expect(container.querySelector('.rf-location-notice--inline')).toBeTruthy();
    });

    // The block is display:none until a rejection shows it, so this variant is
    // in the DOM long before anyone sees it. Counting it would inflate the
    // recovery-rate denominator with viewers who never saw a thing.
    it('does not fire the shown event', () => {
      render(<LocationRecoveryControl variant="inline" permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      expect(trackPosthogEvent.mock.calls.filter(([n]) => n === 'viewer_location_recovery_shown')).toHaveLength(0);
    });

    it('still records a tap, tagged with the variant', () => {
      render(<LocationRecoveryControl variant="inline" permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Enable location' }));
      expect(trackPosthogEvent).toHaveBeenCalledWith(
        'viewer_location_recovery_click',
        expect.objectContaining({ variant: 'inline' })
      );
    });

    it('keeps the denied-state rules — instructions, no button', () => {
      setUserAgent(IOS_SAFARI);
      render(<LocationRecoveryControl variant="inline" permission={LocationPermission.DENIED} onRetry={vi.fn()} />);
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('renders nothing when permission is granted', () => {
      const { container } = render(
        <LocationRecoveryControl variant="inline" permission={LocationPermission.GRANTED} onRetry={vi.fn()} />
      );
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('instrumentation', () => {
    it('records that a viewer actually saw a control, with its tier', () => {
      render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      expect(trackPosthogEvent).toHaveBeenCalledWith(
        'viewer_location_recovery_shown',
        expect.objectContaining({ tier: 'button', permission: LocationPermission.PROMPT, client_class: 'browser' })
      );
    });

    it('records nothing for a viewer who sees no control', () => {
      render(<LocationRecoveryControl permission={LocationPermission.GRANTED} onRetry={vi.fn()} />);
      expect(trackPosthogEvent).not.toHaveBeenCalled();
    });

    it('records the tap so the recovery rate has a numerator', () => {
      render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Enable location' }));
      expect(trackPosthogEvent).toHaveBeenCalledWith('viewer_location_recovery_click', expect.objectContaining({ tier: 'button' }));
    });

    // The viewer page reparses roughly once a second while a song plays, which
    // regenerates this element every tick. If that remounted the control, the
    // shown-event would fire ~60x/minute per viewer and the recovery-rate
    // denominator would be meaningless.
    it('records the viewer once, not on every page reparse', () => {
      const { rerender } = render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      rerender(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      rerender(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      expect(trackPosthogEvent.mock.calls.filter(([name]) => name === 'viewer_location_recovery_shown')).toHaveLength(1);
    });

    // Review finding: the effect refired on every permission/tier change, and
    // permission legitimately changes while the control is up (prompt -> denied,
    // or a permissionchange from browser settings). That double-counted the
    // viewers who engaged — inflating the denominator the recovery rate is
    // measured against, in the direction that flatters the feature.
    it('records the viewer once even when their permission state changes', () => {
      const { rerender } = render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      rerender(<LocationRecoveryControl permission={LocationPermission.DENIED} onRetry={vi.fn()} />);
      rerender(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      expect(trackPosthogEvent.mock.calls.filter(([n]) => n === 'viewer_location_recovery_shown')).toHaveLength(1);
    });

    it('separates the in-app population, which is a third of all rejections', () => {
      setUserAgent(FACEBOOK);
      render(<LocationRecoveryControl permission={LocationPermission.PROMPT} onRetry={vi.fn()} />);
      expect(trackPosthogEvent).toHaveBeenCalledWith(
        'viewer_location_recovery_shown',
        expect.objectContaining({ tier: 'in_app', client_class: 'facebook_in_app' })
      );
    });
  });
});
