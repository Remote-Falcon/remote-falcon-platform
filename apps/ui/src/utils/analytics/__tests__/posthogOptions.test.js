import { describe, it, expect } from 'vitest';

import { buildPosthogOptions } from '../posthogOptions';

// These assertions are a cost guard, not a style preference. Viewer pages run
// ~9.4k sessions/mo against the control panel's ~2.0k, and session replay bills
// per recording at 1-5 MB each. Replay was never deliberately enabled for
// viewers — it switched itself on via PostHog remote config the moment the
// /rf-relay CORS bug was fixed. Client config wins over remote config in
// posthog-js, so these keys are the only thing standing between a project
// settings change and a surprise bill.
describe('buildPosthogOptions', () => {
  const viewer = buildPosthogOptions({ onViewerPage: true });
  const controlPanel = buildPosthogOptions({ onViewerPage: false });

  describe('on viewer pages', () => {
    it.each([
      ['disable_session_recording', true],
      ['autocapture', false],
      ['capture_heatmaps', false],
      ['capture_dead_clicks', false],
      ['disable_surveys', true]
    ])('pins %s to %s so remote config cannot re-enable it', (key, expected) => {
      expect(viewer[key]).toBe(expected);
    });

    // Deliberate keeps. Each costs little and answers a question nothing else
    // can, so a future volume cut shouldn't take them by accident.
    it('keeps exception capture — the only signal for operator-facing breakage', () => {
      expect(viewer.capture_exceptions).toBe(true);
    });

    it('keeps web vitals — the measurement baseline for viewer performance work', () => {
      expect(viewer.capture_performance).toEqual({ web_vitals: true });
    });

    it('leaves $pageleave alone so viewer traffic stays in Web Analytics', () => {
      expect(viewer.capture_pageleave).toBeUndefined();
    });

    // A viewer page is one route with no client-side navigation, so
    // history_change would never fire there anyway. Pinning it back to the
    // page-load-only default keeps this surface's volume identical to what it
    // was before the control panel's SPA pageview fix — worth an assertion,
    // because viewers out-session the control panel ~4.7 to 1.
    it('keeps page-load-only pageviews, unaffected by the control panel SPA fix', () => {
      expect(viewer.capture_pageview).toBe(true);
    });
  });

  describe('on the control panel', () => {
    it.each(['disable_session_recording', 'autocapture', 'capture_heatmaps', 'capture_dead_clicks', 'disable_surveys'])(
      'does not set %s, leaving the project defaults in force',
      (key) => {
        expect(controlPanel[key]).toBeUndefined();
      }
    );

    // posthog-js' legacy default fires $pageview only on a full page load, so
    // every react-router route change was invisible to Web Analytics.
    it('captures $pageview on SPA route changes', () => {
      expect(controlPanel.capture_pageview).toBe('history_change');
    });
  });

  it('routes ingest through the same-origin relay on both surfaces', () => {
    for (const options of [viewer, controlPanel]) {
      expect(options.api_host).toBe('https://remotefalcon.com/rf-relay');
      expect(options.ui_host).toBe('https://us.posthog.com');
      // Anonymous viewers must not create person profiles.
      expect(options.person_profiles).toBe('identified_only');
    }
  });
});
