import { describe, expect, it } from 'vitest';

import { DASHBOARD_LIVE_STATS } from '../../../../../utils/graphql/controlPanel/queries';
import * as heartbeat from '../heartbeat';
import { pluginChecklistRow, pluginStatus } from '../heartbeat';

const now = 1_800_000_000_000;
const minutesAgo = (m) => now - m * 60 * 1000;

describe('pluginStatus', () => {
  it('trusts the server flag, not the heartbeat age', () => {
    // A fresh-looking timestamp with the server saying offline stays offline,
    // and vice versa: the threshold lives only in control-panel.
    expect(pluginStatus({ pluginConnected: false, lastHeartbeatMs: now }).isConnected).toBe(false);
    expect(pluginStatus({ pluginConnected: true, lastHeartbeatMs: minutesAgo(60) }).isConnected).toBe(true);
  });

  it('treats a missing flag (older server) as not connected', () => {
    expect(pluginStatus({ lastHeartbeatMs: now }).isConnected).toBe(false);
    expect(pluginStatus(undefined)).toEqual({
      isConnected: false,
      hasEverConnected: false
    });
  });

  it('derives hasEverConnected from the timestamp', () => {
    expect(pluginStatus({ pluginConnected: false, lastHeartbeatMs: null }).hasEverConnected).toBe(false);
    expect(pluginStatus({ pluginConnected: false, lastHeartbeatMs: 0 }).hasEverConnected).toBe(false);
    expect(pluginStatus({ pluginConnected: false, lastHeartbeatMs: minutesAgo(9) }).hasEverConnected).toBe(true);
  });

  it('no longer exports a client-side threshold', () => {
    expect(heartbeat.HEARTBEAT_FRESH_MS).toBeUndefined();
    expect(heartbeat.isHeartbeatFresh).toBeUndefined();
  });
});

describe('pluginChecklistRow', () => {
  it('renders no row until live stats load', () => {
    expect(pluginChecklistRow(undefined, now)).toBeNull();
    expect(pluginChecklistRow(null, now)).toBeNull();
  });

  it('is ok when the server says connected', () => {
    expect(pluginChecklistRow({ pluginConnected: true, lastHeartbeatMs: minutesAgo(2) }, now)).toEqual({
      status: 'ok',
      label: 'FPP plugin connected'
    });
  });

  it('warns "never received" with no heartbeat', () => {
    const row = pluginChecklistRow({ pluginConnected: false, lastHeartbeatMs: null }, now);
    expect(row.status).toBe('warn');
    expect(row.label).toBe('No FPP plugin heartbeat received yet');
  });

  it('warns offline with the heartbeat age when the server says offline', () => {
    const row = pluginChecklistRow({ pluginConnected: false, lastHeartbeatMs: minutesAgo(9.5) }, now);
    expect(row.status).toBe('warn');
    expect(row.label).toBe('FPP plugin offline (last heartbeat 9 min ago)');
  });
});

describe('DASHBOARD_LIVE_STATS', () => {
  it('selects the server-computed flag alongside the timestamp', () => {
    const op = DASHBOARD_LIVE_STATS.definitions.find((d) => d.kind === 'OperationDefinition');
    const fields = op.selectionSet.selections[0].selectionSet.selections.map((f) => f.name.value);
    expect(fields).toContain('pluginConnected');
    expect(fields).toContain('lastHeartbeatMs');
  });
});
