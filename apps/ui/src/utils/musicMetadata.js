// Song-metadata lookup against the iTunes Search API (PRD-remote-falcon-003).
//
// Browser-direct, no auth, no backend proxy. Apple's endpoint sends a
// permissive CORS header and responses are Akamai-cached for 24h, so
// per-owner edit-session volume is a non-issue. If Apple's ToU or CORS
// posture ever changes, Deezer's public search is the documented fallback
// (see the PRD's API-choice table).
//
// Note: this deliberately does NOT use the shared axios instance. That
// instance carries the Remote Falcon session JWT in a default Authorization
// header, which must never be sent to Apple.

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const RESULT_LIMIT = 5;
// A single lookup should never hang the caller: the bulk dialog blocks its
// Cancel path on the in-flight request settling, so cap it.
const LOOKUP_TIMEOUT_MS = 15000;
// Repeat-term cache (reopening the popover on the same row, duplicate
// names in a bulk pass) and a minimum gap between real fetches, so
// unpaced single lookups can't stack onto Apple's ~20/min budget while a
// bulk pass is running in another tab.
const CACHE_MAX_ENTRIES = 50;
const MIN_FETCH_GAP_MS = 1000;

const resultCache = new Map();
let lastFetchAt = 0;

// Test hook: lookups are module-singletons, so suites reset between cases.
export const __resetLookupStateForTests = () => {
  resultCache.clear();
  lastFetchAt = 0;
};

// artworkUrl100 is a 100x100 thumbnail, but the same CDN path serves
// arbitrary renditions by filename; 600x600bb is plenty for the viewer
// page's "Now Playing" card without shipping a 3000px original.
export const toHdArtwork = (url) => (url ? url.replace('100x100bb', '600x600bb') : null);

// Sequence names are usually filenames ("01_wizards_in_winter_v2.fseq"),
// which make terrible search terms verbatim. Strip the extension, drop a
// leading track number only when a separator follows it ("01_", "01 - ",
// "01."), turn separators into spaces, and drop trailing version tags.
// A bare leading number with no separator is kept: "12 Days of Christmas"
// and "99 Luftballons" are titles, not track prefixes. Falls back to the
// trimmed original if cleaning would empty the query (e.g. a name that is
// all digits and separators).
export const cleanLookupQuery = (raw) => {
  const original = String(raw || '').trim();
  const cleaned = original
    .replace(/\.(fseq|eseq|mp3|mp4|m4a|wav|ogg|aac|flac|avi)$/i, '')
    .replace(/^\s*\d{1,3}\s*[-._]+\s*/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+(v|ver|version)\s*\d+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || original;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const lookupITunes = async (query, { signal } = {}) => {
  const term = (query || '').trim();
  if (!term) return [];

  const cacheKey = term.toLowerCase();
  if (resultCache.has(cacheKey)) return resultCache.get(cacheKey);

  // Pace real fetches; cached repeats above stay instant.
  const wait = lastFetchAt + MIN_FETCH_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  lastFetchAt = Date.now();

  const params = new URLSearchParams({
    term,
    entity: 'song',
    media: 'music',
    limit: String(RESULT_LIMIT)
  });

  // Compose the caller's signal with a hard timeout so a hung request can
  // always be cancelled (Cancel in the bulk dialog aborts this signal).
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeoutTimer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(`${ITUNES_SEARCH_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`iTunes search failed (${response.status})`);
    }
    // Content-type is text/javascript but the body is plain JSON.
    const data = await response.json();

    const results = (data?.results || [])
      .filter((r) => r?.trackName && r?.artistName)
      .map((r) => ({
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName ?? null,
        artworkUrl: toHdArtwork(r.artworkUrl100),
        thumbnailUrl: r.artworkUrl100 ?? null
      }));

    resultCache.set(cacheKey, results);
    if (resultCache.size > CACHE_MAX_ENTRIES) {
      resultCache.delete(resultCache.keys().next().value);
    }
    return results;
  } finally {
    clearTimeout(timeoutTimer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
};
