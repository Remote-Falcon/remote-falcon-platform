// The plugin counts as connected if its stored heartbeat is younger than this.
// plugins-api writes the heartbeat at most every 120s, so the stored value can
// trail the plugin's real last beat by up to ~150s: "Offline" means 4.5-7 min
// of real silence, and "last heartbeat N min ago" can overstate by up to
// 2.5 min. A healthy plugin never reads as offline. Must match the
// backend's HEARTBEAT_GAP_THRESHOLD_MINUTES and control-panel's
// HEARTBEAT_STALE_MINUTES, so the dashboard tiles, the readiness checklist and
// the alert task can never disagree.
export const HEARTBEAT_FRESH_MS = 7 * 60 * 1000;

export const isHeartbeatFresh = (lastHeartbeatMs, now = Date.now()) =>
  !!lastHeartbeatMs && now - lastHeartbeatMs < HEARTBEAT_FRESH_MS;
