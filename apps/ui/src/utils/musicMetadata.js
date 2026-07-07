// Song-metadata lookup against the iTunes Search API (PRD-remote-falcon-003).
//
// Browser-direct, no auth, no backend proxy — Apple's endpoint sends a
// permissive CORS header and responses are Akamai-cached for 24h, so
// per-owner edit-session volume is a non-issue. If Apple's ToU or CORS
// posture ever changes, Deezer's public search is the documented fallback
// (see the PRD's API-choice table).

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
const RESULT_LIMIT = 5;

// artworkUrl100 is a 100x100 thumbnail, but the same CDN path serves
// arbitrary renditions by filename — 600x600bb is plenty for the viewer
// page's "Now Playing" card without shipping a 3000px original.
export const toHdArtwork = (url) => (url ? url.replace('100x100bb', '600x600bb') : null);

export const lookupITunes = async (query) => {
  const term = (query || '').trim();
  if (!term) return [];

  const params = new URLSearchParams({
    term,
    entity: 'song',
    media: 'music',
    limit: String(RESULT_LIMIT)
  });
  const response = await fetch(`${ITUNES_SEARCH_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`iTunes search failed (${response.status})`);
  }
  // Content-type is text/javascript but the body is plain JSON.
  const data = await response.json();

  return (data?.results || [])
    .filter((r) => r?.trackName && r?.artistName)
    .map((r) => ({
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName ?? null,
      artworkUrl: toHdArtwork(r.artworkUrl100),
      thumbnailUrl: r.artworkUrl100 ?? null
    }));
};
