/**
 * Automatic capture switched off on viewer pages.
 *
 * Viewer pages are ~4.7x the control panel by session count (9.4k vs 2.0k per
 * month) and their body is operator-authored HTML that differs per show, so
 * most of PostHog's automatic capture is expensive noise there.
 */
const viewerCaptureOverrides = {
  // ~9.4k sessions/mo at 1-5 MB per recording. Never deliberately enabled for
  // viewers — it came on by itself via remote config.
  disable_session_recording: true,
  // Autocaptured selectors don't aggregate across shows: every operator writes
  // their own markup, so a click on one show is unjoinable with any other.
  // Turning this off also takes $rageclick and the heatmap data stream with it.
  autocapture: false,
  capture_heatmaps: false,
  capture_dead_clicks: false,
  disable_surveys: true
};

/**
 * Builds the posthog-js init config.
 *
 * One bundle serves both the control panel (apex) and every viewer page
 * (`<show>.remotefalcon.com`), so the capture split is a runtime decision.
 *
 * Everything here is set CLIENT-side deliberately. posthog-js resolves client
 * config ahead of remote config (remote is only the fallback when a key is
 * undefined), and remote config is precisely what silently switched session
 * replay on for viewers the moment the /rf-relay CORS bug was fixed. Pinning
 * these means a PostHog project-settings change cannot quietly re-enable
 * capture on the highest-volume surface we have.
 *
 * @param {object} params
 * @param {boolean} params.onViewerPage Whether this page load is a viewer page.
 * @returns {object} options for `posthog.init`
 */
export const buildPosthogOptions = ({ onViewerPage }) => ({
  // Same-origin ingest via the Cloudflare Worker (issue #130).
  api_host: 'https://remotefalcon.com/rf-relay',
  ui_host: 'https://us.posthog.com',
  person_profiles: 'identified_only',

  // Kept ON for viewers: ~134 events/mo, and viewer-side exceptions are how
  // operator-facing breakage surfaces at all (e.g. the iOS Safari dynMenu
  // failures on lightsonsunset).
  capture_exceptions: true,

  // Web vitals need BOTH this SDK opt-in AND the project-side "Capture web
  // vitals" toggle; either alone is a silent no-op. Kept on for viewers — it's
  // the only field signal on the surface serving ~3.2k monthly users, and the
  // measurement baseline for the viewer performance work.
  capture_performance: { web_vitals: true },

  // $pageview/$pageleave stay on everywhere: they're what PostHog Web Analytics
  // (sessions, bounce rate, referrers) is built from, and dropping them would
  // remove viewer traffic from it entirely.

  ...(onViewerPage ? viewerCaptureOverrides : {})
});

export default buildPosthogOptions;
