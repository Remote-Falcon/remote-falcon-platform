// Remote Falcon — anonymous viewer id (PRD A3).
//
// Synchronous source of the browser-local, first-party UUID that the viewer
// page sends on every mutation so the backend can count unique visits
// (new-vs-returning, season regulars) without relying on rotating IPs.
//
// Why a synchronous util and not just `window.rfViewerId()` from the
// vendored `public/viewer-scripts/viewerId.js`: the page-view ping
// (insertViewerPageStats) fires on mount, before the enhancement scripts are
// loaded, so a script-exposed global would be undefined on the first — and
// most important — call. Both this util and that script read/write the same
// `rf-viewer-id` key, so they always agree. The script is still loaded for
// the passive privacy notice it renders.
export const VIEWER_ID_STORAGE_KEY = 'rf-viewer-id';

function uuidv4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Returns the persisted anonymous viewer id, lazily creating it on first
// visit. Returns null when localStorage is unavailable (incognito with strict
// settings, embedded contexts) — the backend treats a null viewerId as
// "unknown" and falls back to IP-based identity.
export const getViewerId = () => {
  try {
    const existing = window.localStorage.getItem(VIEWER_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = uuidv4();
    window.localStorage.setItem(VIEWER_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return null;
  }
};
