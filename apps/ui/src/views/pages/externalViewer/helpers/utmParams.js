/**
 * Issue #189: first-party campaign attribution for the page-view ping.
 *
 * The QR Code page's "Tag with print campaign" toggle appends
 * `utm_source=qr&utm_medium=print` to the viewer URL. We read those two values
 * from the page's OWN query string (never document.referrer or the Referer
 * header), normalize them, send them with insertViewerPageStats, and then strip
 * them from the address bar so a link the viewer shares onward does not count
 * as another QR scan.
 *
 * Normalization mirrors the viewer service's UtmUtil.sanitize (the server
 * re-applies it because the mutation is public): trim, lowercase, cap at 32
 * chars, and drop blank values entirely.
 */

export const UTM_MAX_LENGTH = 32;

/** Query-string key -> GraphQL variable name. Only these two are read or stripped. */
const UTM_PARAMS = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium']
];

export const sanitizeUtmValue = (value) => {
  if (typeof value !== 'string') return null;
  // Same allowlist as the viewer service's UtmUtil: whitespace runs become
  // '_', anything outside [a-z0-9_-] is dropped (no spreadsheet formulas).
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, UTM_MAX_LENGTH);
  return normalized === '' ? null : normalized;
};

/**
 * Returns only the variables that are present after sanitizing, e.g.
 * `{ utmSource: 'qr', utmMedium: 'print' }`, or `{}` for an untagged visit,
 * so untagged pings send exactly what they sent before #189.
 */
export const readUtmParams = (search) => {
  let params;
  try {
    params = new URLSearchParams(search || '');
  } catch {
    return {};
  }
  const result = {};
  UTM_PARAMS.forEach(([key, variable]) => {
    const value = sanitizeUtmValue(params.get(key));
    if (value) result[variable] = value;
  });
  return result;
};

/**
 * Given a full href, returns the same URL as a relative path (pathname, search,
 * hash) with utm_source / utm_medium removed and every other param kept in
 * order. Returns null when there is nothing to strip, so the caller can skip
 * the history write.
 */
export const stripUtmParams = (href) => {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const present = UTM_PARAMS.some(([key]) => url.searchParams.has(key));
  if (!present) return null;
  UTM_PARAMS.forEach(([key]) => url.searchParams.delete(key));
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
};

/** Rewrites the address bar in place (no navigation, no new history entry). */
export const stripUtmFromAddressBar = (win = typeof window !== 'undefined' ? window : undefined) => {
  if (!win?.location || typeof win.history?.replaceState !== 'function') return;
  const next = stripUtmParams(win.location.href);
  if (next == null) return;
  try {
    win.history.replaceState(win.history.state, '', next);
  } catch {
    // A sandboxed frame can refuse replaceState; attribution already went out.
  }
};
