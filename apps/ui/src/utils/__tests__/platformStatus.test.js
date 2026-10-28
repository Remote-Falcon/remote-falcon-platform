import { describe, it, expect, vi, afterEach } from 'vitest';

import { STATUS_FEED_URL, fetchPlatformStatus, parseStatusFeed } from '../platformStatus';

// Trimmed shape of https://status.remotefalcon.com/index.json (Better Stack).
const feed = (aggregate, resources) => ({
  data: { attributes: { aggregate_state: aggregate } },
  included: [
    { type: 'status_page_section', attributes: { name: 'Viewer Pages' } },
    ...resources.map(([publicName, status]) => ({
      type: 'status_page_resource',
      attributes: { public_name: publicName, status }
    }))
  ]
});

describe('parseStatusFeed', () => {
  it('reports operational with nothing affected when every resource is up', () => {
    expect(parseStatusFeed(feed('operational', [['Website', 'operational'], ['Viewer API', 'operational']]))).toEqual({
      state: 'operational',
      affected: []
    });
  });

  it('lists the public names of resources that are not operational', () => {
    const result = parseStatusFeed(
      feed('downtime', [
        ['Website', 'operational'],
        ['Viewer Pages', 'downtime'],
        ['Viewer API', 'degraded']
      ])
    );
    expect(result).toEqual({ state: 'downtime', affected: ['Viewer Pages', 'Viewer API'] });
  });

  it('does not count not_monitored resources as affected', () => {
    expect(parseStatusFeed(feed('operational', [['Website', 'not_monitored']])).affected).toEqual([]);
  });

  it('passes maintenance through as its own state', () => {
    expect(parseStatusFeed(feed('maintenance', [['FPP Plugin API', 'maintenance']]))).toEqual({
      state: 'maintenance',
      affected: ['FPP Plugin API']
    });
  });

  it('treats a missing or malformed feed as operational', () => {
    expect(parseStatusFeed(null)).toEqual({ state: 'operational', affected: [] });
    expect(parseStatusFeed({})).toEqual({ state: 'operational', affected: [] });
    expect(parseStatusFeed({ data: {}, included: 'nope' })).toEqual({ state: 'operational', affected: [] });
  });
});

describe('fetchPlatformStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the status feed and parses it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(feed('degraded', [['Control Panel API', 'degraded']]))
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPlatformStatus()).resolves.toEqual({ state: 'degraded', affected: ['Control Panel API'] });
    expect(fetchMock).toHaveBeenCalledWith(STATUS_FEED_URL, expect.objectContaining({ credentials: 'omit' }));
  });

  it('throws on a non-2xx response so callers can ignore it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchPlatformStatus()).rejects.toThrow('503');
  });
});
