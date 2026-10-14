// insertViewerPageStats is a database write, and it used to fire on every page
// load. During a backend slowdown viewers reload repeatedly, so the write
// multiplied exactly when the database could least afford it, and the page-view
// count inflated with it. One write per show per browser session is what the
// stat means anyway.
//
// sessionStorage is per-tab and cleared when the tab closes, which matches
// "a viewing session". Blocked storage (strict privacy modes, sandboxed
// iframes) throws on access; that degrades to the old behavior of recording
// every load rather than never recording.

const keyFor = (showSubdomain) => `rf.viewerPageStats.${showSubdomain}`;

const sessionStorageOrNull = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const viewerPageStatsAlreadyRecorded = (showSubdomain, storage = sessionStorageOrNull()) => {
  try {
    return storage?.getItem(keyFor(showSubdomain)) === '1';
  } catch {
    return false;
  }
};

export const markViewerPageStatsRecorded = (showSubdomain, storage = sessionStorageOrNull()) => {
  try {
    storage?.setItem(keyFor(showSubdomain), '1');
  } catch {
    /* storage blocked: the next load records again, same as before this guard */
  }
};
