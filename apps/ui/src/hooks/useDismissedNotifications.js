import { useCallback, useEffect, useState } from 'react';

// Per-device "read" state for the header notification bell.
//
// We don't fan out read-receipts to the server — operators tend to
// dismiss-and-forget, and a single shared write path keeps the backend
// surface tiny. Persist the set of dismissed UUIDs in localStorage and
// hydrate on mount; if the value is missing or corrupt, reset cleanly.
const STORAGE_KEY = 'rf:dismissedNotificationUuids';

const readFromStorage = () => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v) => typeof v === 'string'));
  } catch {
    // Corrupt JSON — drop it so the user isn't stuck with stale state.
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — fine, return empty */
    }
    return new Set();
  }
};

const writeToStorage = (set) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* storage full or blocked — ignore, in-memory state still correct */
  }
};

const useDismissedNotifications = () => {
  const [dismissedSet, setDismissedSet] = useState(() => readFromStorage());

  // Re-hydrate on mount in case storage changed in another tab between
  // the lazy initializer and first render. Cheap; runs once.
  useEffect(() => {
    setDismissedSet(readFromStorage());
  }, []);

  const dismiss = useCallback((uuid) => {
    if (!uuid) return;
    setDismissedSet((prev) => {
      if (prev.has(uuid)) return prev;
      const next = new Set(prev);
      next.add(uuid);
      writeToStorage(next);
      return next;
    });
  }, []);

  const dismissAll = useCallback((uuids) => {
    if (!Array.isArray(uuids) || uuids.length === 0) return;
    setDismissedSet((prev) => {
      const next = new Set(prev);
      let changed = false;
      uuids.forEach((u) => {
        if (typeof u === 'string' && !next.has(u)) {
          next.add(u);
          changed = true;
        }
      });
      if (!changed) return prev;
      writeToStorage(next);
      return next;
    });
  }, []);

  // Drop dismissed uuids that no longer correspond to a live notification.
  // Server-side notifications get replaced/cleared over time (FPP_HEALTH
  // entries churn per outage), so without pruning the stored set grows
  // unboundedly with uuids that can never match again.
  const prune = useCallback((currentUuids) => {
    if (!Array.isArray(currentUuids)) return;
    const current = new Set(currentUuids.filter((u) => typeof u === 'string'));
    setDismissedSet((prev) => {
      const next = new Set(Array.from(prev).filter((u) => current.has(u)));
      if (next.size === prev.size) return prev;
      writeToStorage(next);
      return next;
    });
  }, []);

  return { dismissedSet, dismiss, dismissAll, prune };
};

export default useDismissedNotifications;
