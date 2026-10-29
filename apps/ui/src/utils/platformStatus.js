// Reads the public Better Stack status page (status.remotefalcon.com) so the
// control panel can tell owners when RF itself is having trouble, before they
// start debugging their own show. The JSON feed is public and served with
// `Access-Control-Allow-Origin: *`, so the browser reads it directly.

export const STATUS_PAGE_URL = 'https://status.remotefalcon.com';
export const STATUS_FEED_URL = `${STATUS_PAGE_URL}/index.json`;

// `not_monitored` means a monitor is paused or new, not that it is failing.
const HEALTHY = new Set(['operational', 'not_monitored']);

const OPERATIONAL = { state: 'operational', affected: [] };

/**
 * @param {unknown} json  body of STATUS_FEED_URL
 * @returns {{ state: string, affected: string[] }} `state` is Better Stack's
 *   aggregate_state (operational | degraded | downtime | maintenance);
 *   `affected` lists the public names of resources that are not healthy.
 *   Anything unparseable reads as operational so a feed change never shows a
 *   false alarm.
 */
export const parseStatusFeed = (json) => {
  const state = json?.data?.attributes?.aggregate_state;
  if (typeof state !== 'string') return OPERATIONAL;
  const included = Array.isArray(json.included) ? json.included : [];
  const affected = included
    .filter((item) => item?.type === 'status_page_resource' && !HEALTHY.has(item.attributes?.status))
    .map((item) => item.attributes.public_name)
    .filter(Boolean);
  return { state, affected };
};

export const fetchPlatformStatus = async () => {
  const res = await fetch(STATUS_FEED_URL, { credentials: 'omit', cache: 'no-store' });
  if (!res.ok) throw new Error(`status feed returned ${res.status}`);
  return parseStatusFeed(await res.json());
};
