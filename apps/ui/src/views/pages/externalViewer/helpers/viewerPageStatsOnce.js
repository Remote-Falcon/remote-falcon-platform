// insertViewerPageStats is a database write that fires on every page load.
// During a backend slowdown viewers reload repeatedly, so the write multiplied
// exactly when the database could least afford it. A load within
// DEDUPE_WINDOW_MS of the last recorded one for the same show is skipped: that
// collapses reload storms while ordinary reloads and return visits still count,
// so the owner-facing page-view metric keeps its meaning.
//
// sessionStorage is per-tab. Blocked storage (strict privacy modes, sandboxed
// iframes) throws on access; that degrades to the old behavior of recording
// every load rather than never recording.

export const DEDUPE_WINDOW_MS = 60000;

const keyFor = (showSubdomain) => `rf.viewerPageStats.${showSubdomain}`;

const sessionStorageOrNull = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const viewerPageStatsAlreadyRecorded = (showSubdomain, storage = sessionStorageOrNull(), now = Date.now()) => {
  try {
    const recordedAt = Number(storage?.getItem(keyFor(showSubdomain)));
    return Number.isFinite(recordedAt) && recordedAt > 0 && now - recordedAt < DEDUPE_WINDOW_MS;
  } catch {
    return false;
  }
};

export const markViewerPageStatsRecorded = (showSubdomain, storage = sessionStorageOrNull(), now = Date.now()) => {
  try {
    storage?.setItem(keyFor(showSubdomain), String(now));
  } catch {
    /* storage blocked: the next load records again, same as before this guard */
  }
};
