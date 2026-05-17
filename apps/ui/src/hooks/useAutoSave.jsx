import { useEffect, useRef, useState } from 'react';

import _ from 'lodash';

import { trackPosthogEvent } from '../utils/analytics/posthog';

// Debounced auto-save hook for v2 settings forms.
//
// Watches `values` for changes against the last-saved snapshot. When they
// diverge, schedules `save(values)` after `delay` ms (default 600). The
// returned status drives the StickyFormBar indicator:
//
//   'idle'   — no pending changes; identical to last save
//   'dirty'  — user is editing, debounce window not yet elapsed
//   'saving' — save() is in flight
//   'saved'  — save() resolved; auto-fades back to 'idle' after `flashMs`
//   'error'  — save() rejected; persists until next change
//
// Pass an isValid() callback to short-circuit saves when validation is
// failing — the form stays 'dirty' until valid, then auto-saves.
const useAutoSave = (values, save, { delay = 600, flashMs = 1500, isValid = () => true } = {}) => {
  const [status, setStatus] = useState('idle');
  const lastSaved = useRef(values);
  const initialized = useRef(false);
  const timerRef = useRef(null);
  const flashRef = useRef(null);

  useEffect(() => {
    // Skip the very first run — `values` initialised from props/server.
    if (!initialized.current) {
      initialized.current = true;
      lastSaved.current = values;
      return undefined;
    }

    if (_.isEqual(values, lastSaved.current)) {
      return undefined;
    }

    setStatus('dirty');

    if (timerRef.current) clearTimeout(timerRef.current);
    if (flashRef.current) clearTimeout(flashRef.current);

    if (!isValid()) {
      // Hold in 'dirty' — don't fire save until form is valid again.
      return undefined;
    }

    timerRef.current = setTimeout(async () => {
      const snapshot = values;
      setStatus('saving');
      try {
        await save(snapshot);
        lastSaved.current = snapshot;
        setStatus('saved');
        flashRef.current = setTimeout(() => setStatus('idle'), flashMs);
      } catch (err) {
        trackPosthogEvent('viewer_page_autosave_failed', {
          error: err?.message,
          operation: 'viewer_page'
        });
        setStatus('error');
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  // If something else (e.g. a server refetch) updates `values` in a way
  // that matches the lastSaved snapshot, drop back to idle so the bar
  // doesn't appear stuck on 'dirty'.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (flashRef.current) clearTimeout(flashRef.current);
  }, []);

  return status;
};

export default useAutoSave;
