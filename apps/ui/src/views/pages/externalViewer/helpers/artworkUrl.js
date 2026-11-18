/**
 * The viewer replaces inline `data:` artwork in getShow with a short URL to its
 * cacheable /artwork endpoint (S2, Season Prep R2). In SaaS that URL is
 * absolute; elsewhere it is root-relative (`/remote-falcon-viewer/artwork/...`),
 * which only works when the page's own host proxies the viewer path. Resolve it
 * against VITE_VIEWER_API, the address this page already uses to reach the
 * viewer, so it works on every host and port. Anything else passes through.
 */
// eslint-disable-next-line import/prefer-default-export
export const resolveArtworkUrl = (imageUrl, viewerApi = import.meta.env.VITE_VIEWER_API) => {
  if (!imageUrl || !viewerApi || !imageUrl.startsWith('/') || imageUrl.startsWith('//')) {
    return imageUrl;
  }
  let api;
  try {
    api = new URL(viewerApi);
  } catch {
    return imageUrl;
  }
  const artworkPrefix = `${api.pathname.replace(/\/+$/, '')}/artwork/`;
  if (!imageUrl.startsWith(artworkPrefix)) {
    return imageUrl;
  }
  return `${api.origin}${imageUrl}`;
};
