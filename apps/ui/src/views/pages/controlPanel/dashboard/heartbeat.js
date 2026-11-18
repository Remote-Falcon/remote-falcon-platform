// FPP plugin connection state, read from dashboardLiveStats.
//
// The Connected/Offline threshold lives only on the server: control-panel
// computes `pluginConnected` from the same constant its FPP alert task uses
// (and plugins-api's heartbeat-gap detection matches it), so the dashboard
// tiles, the readiness checklist and the alerts can never disagree. Do not
// re-derive it here from lastHeartbeatMs; that copy of the threshold is what
// this replaced. lastHeartbeatMs is still used for "last heartbeat N min ago".
export const pluginStatus = (liveStats) => ({
  isConnected: liveStats?.pluginConnected === true,
  hasEverConnected: !!liveStats?.lastHeartbeatMs
});

// The pre-show checklist's plugin row. null while live stats have not loaded
// (first fetch pending, failed, or tab hidden): no row rather than a false
// "never received".
export const pluginChecklistRow = (liveStats, now = Date.now()) => {
  if (!liveStats) return null;
  const { isConnected, hasEverConnected } = pluginStatus(liveStats);
  if (isConnected) {
    return { status: 'ok', label: 'FPP plugin connected' };
  }
  if (!hasEverConnected) {
    return {
      status: 'warn',
      label: 'No FPP plugin heartbeat received yet',
      detail: 'Install or restart the Remote Falcon FPP plugin to start syncing.'
    };
  }
  const minutesAgo = Math.floor(Math.max(0, now - liveStats.lastHeartbeatMs) / 60000);
  return {
    status: 'warn',
    label: `FPP plugin offline (last heartbeat ${minutesAgo} min ago)`,
    detail: 'Show may not be running. Check the FPP controller.'
  };
};
