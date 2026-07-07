import { afterEach, describe, expect, it, vi } from 'vitest';

import { lookupITunes, toHdArtwork } from '../musicMetadata';

// The sequence-metadata lookup (PRD-remote-falcon-003) hits the iTunes
// Search API browser-direct and commits artist + imageUrl onto a sequence.
// These tests pin the request shape, the result mapping (including the
// 100x100 → 600x600 HD artwork swap), and the failure contract so a quiet
// iTunes response-shape change surfaces here instead of as blank popovers.

const itunesResult = (overrides = {}) => ({
  trackName: 'Carol of the Bells',
  artistName: 'Trans-Siberian Orchestra',
  collectionName: 'The Christmas Attic',
  artworkUrl100:
    'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover.jpg/100x100bb.jpg',
  ...overrides
});

const mockFetchJson = (body, { ok = true, status = 200 } = {}) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body)
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toHdArtwork', () => {
  it('swaps the 100x100 thumbnail for the 600x600 rendition', () => {
    expect(toHdArtwork('https://x.mzstatic.com/thumb/cover.jpg/100x100bb.jpg')).toBe(
      'https://x.mzstatic.com/thumb/cover.jpg/600x600bb.jpg'
    );
  });

  it('passes through URLs without the thumbnail marker unchanged', () => {
    expect(toHdArtwork('https://x.mzstatic.com/cover.jpg')).toBe('https://x.mzstatic.com/cover.jpg');
  });

  it('returns null for missing input', () => {
    expect(toHdArtwork(null)).toBeNull();
    expect(toHdArtwork(undefined)).toBeNull();
  });
});

describe('lookupITunes', () => {
  it('queries the iTunes search endpoint with the song entity and a capped limit', async () => {
    const fetchMock = mockFetchJson({ resultCount: 0, results: [] });
    await lookupITunes('carol of the bells');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe('https://itunes.apple.com');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('term')).toBe('carol of the bells');
    expect(url.searchParams.get('entity')).toBe('song');
    expect(url.searchParams.get('media')).toBe('music');
    expect(url.searchParams.get('limit')).toBe('5');
  });

  it('maps results to { title, artist, album, artworkUrl } with HD-swapped art', async () => {
    mockFetchJson({ resultCount: 1, results: [itunesResult()] });
    const results = await lookupITunes('carol of the bells');
    expect(results).toEqual([
      {
        title: 'Carol of the Bells',
        artist: 'Trans-Siberian Orchestra',
        album: 'The Christmas Attic',
        artworkUrl:
          'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover.jpg/600x600bb.jpg',
        thumbnailUrl:
          'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover.jpg/100x100bb.jpg'
      }
    ]);
  });

  it('drops results missing a track or artist name', async () => {
    mockFetchJson({
      resultCount: 3,
      results: [
        itunesResult(),
        itunesResult({ trackName: undefined }),
        itunesResult({ artistName: '' })
      ]
    });
    const results = await lookupITunes('carol of the bells');
    expect(results).toHaveLength(1);
  });

  it('tolerates results without artwork', async () => {
    mockFetchJson({ resultCount: 1, results: [itunesResult({ artworkUrl100: undefined })] });
    const [result] = await lookupITunes('carol of the bells');
    expect(result.artworkUrl).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
  });

  it('returns [] without fetching for a blank query', async () => {
    const fetchMock = mockFetchJson({ resultCount: 0, results: [] });
    expect(await lookupITunes('   ')).toEqual([]);
    expect(await lookupITunes('')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-OK response', async () => {
    mockFetchJson({}, { ok: false, status: 503 });
    await expect(lookupITunes('carol of the bells')).rejects.toThrow(/503/);
  });

  it('returns [] when the response has no results array', async () => {
    mockFetchJson({});
    expect(await lookupITunes('carol of the bells')).toEqual([]);
  });
});
