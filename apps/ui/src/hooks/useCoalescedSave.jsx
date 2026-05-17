import { useCallback, useEffect, useRef, useState } from 'react';

import { trackPosthogEvent } from '../utils/analytics/posthog';

// Coalesced on-blur save queue.
//
// Unlike useAutoSave (which fires on every settled value change), this hook
// is driven by explicit `enqueue(payload)` calls — typically one per cell
// blur. Multiple enqueues within `coalesceMs` are batched into a single
// flush, so tabbing through Display Name → Artist → Category fires ONE
// save, not three.
//
// The save callback receives an array of every payload accumulated during
// the coalesce window, so the caller can collapse "two edits to the same
// row" into a single object before writing.
//
// Flushing rules:
//   • coalesceMs after the last enqueue (debounce)
//   • immediately on `flush()`
//   • immediately on window beforeunload
//   • immediately on document visibilitychange → hidden (mobile tab swap)
//
// Status:
//   'idle'   — nothing queued
//   'dirty'  — queued, debounce window not yet elapsed
//   'saving' — save callback in flight
//   'saved'  — last save resolved; auto-fades back to 'idle'
//   'error'  — last save rejected

const useCoalescedSave = (save, { coalesceMs = 600, flashMs = 1500 } = {}) => {
  const [status, setStatus] = useState('idle');
  const queueRef = useRef([]);
  const timerRef = useRef(null);
  const flashRef = useRef(null);
  // The save callback can change identity across renders; capture the
  // latest in a ref so the timer always calls the up-to-date one without
  // restarting the debounce window on every re-render.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const doFlush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (queueRef.current.length === 0) return;
    const batch = queueRef.current;
    queueRef.current = [];
    setStatus('saving');
    try {
      await saveRef.current(batch);
      setStatus('saved');
      if (flashRef.current) clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setStatus('idle'), flashMs);
    } catch (err) {
      trackPosthogEvent('sequence_save_failed', {
        error: err?.message,
        operation: 'sequences_inline_edit'
      });
      setStatus('error');
    }
  }, [flashMs]);

  const enqueue = useCallback(
    (payload) => {
      if (payload === undefined || payload === null) return;
      queueRef.current.push(payload);
      setStatus('dirty');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(doFlush, coalesceMs);
    },
    [coalesceMs, doFlush]
  );

  // Window/visibility flush — never lose a dirty edit because the user
  // closed the tab or backgrounded it.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (queueRef.current.length > 0) doFlush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && queueRef.current.length > 0) doFlush();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [doFlush]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (flashRef.current) clearTimeout(flashRef.current);
    },
    []
  );

  return { status, enqueue, flush: doFlush };
};

export default useCoalescedSave;
