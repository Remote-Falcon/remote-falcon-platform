// Remote Falcon — anonymous viewer-id (PRD A3).
//
// Lazily generates a v4-style UUID on first viewer-page visit and
// persists it in localStorage under `rf-viewer-id`. Exposes the value
// via `window.rfViewerId()` so the viewer-page HTML can include it on
// every Remote Falcon GraphQL/REST mutation.
//
// Privacy: this is a first-party, non-tracking, browser-local UUID.
// Cleared by clearing browser data; per-device only; never sent to any
// third party.
//
// Usage in viewer-page HTML / template:
//   const id = window.rfViewerId();
//   fetch('/remote-falcon-viewer/addSequenceToQueue', {
//     method: 'POST',
//     body: JSON.stringify({ ...payload, viewerId: id })
//   });
(function () {
  'use strict';

  var STORAGE_KEY = 'rf-viewer-id';

  function uuidv4() {
    // Use crypto.randomUUID when available; fall back to a math-random
    // implementation for older browsers. Both produce v4-style UUIDs.
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getOrCreate() {
    try {
      var existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
      var id = uuidv4();
      window.localStorage.setItem(STORAGE_KEY, id);
      return id;
    } catch (e) {
      // localStorage blocked (incognito with strict settings, embedded
      // contexts, etc) — return null and let the backend fall back to
      // IP-based identity.
      return null;
    }
  }

  // Eager-create on script load so the first stat call has it ready.
  var cached = getOrCreate();

  window.rfViewerId = function () {
    return cached || getOrCreate();
  };

  // PRD privacy posture (P1 carryover) — passive footer note disclosing
  // the anonymous device-ID. Tiny, low-opacity, bottom-right; click to
  // expand the full notice. No cookie banner — first-party, first-purpose
  // analytics doesn't trigger GDPR consent flows, but a passive disclosure
  // is the right hygiene to be transparent about it.
  function mountPrivacyNote() {
    if (document.getElementById('rf-privacy-note')) return;
    if (!document || !document.body) return;

    var wrap = document.createElement('div');
    wrap.id = 'rf-privacy-note';
    wrap.setAttribute('aria-label', 'Privacy notice');
    wrap.style.cssText =
      'position:fixed;bottom:6px;right:8px;z-index:2147483647;' +
      'font-family:system-ui,-apple-system,sans-serif;font-size:10px;' +
      'color:rgba(255,255,255,0.5);background:rgba(0,0,0,0.35);' +
      'padding:3px 7px;border-radius:999px;line-height:1.2;' +
      'cursor:pointer;user-select:none;backdrop-filter:blur(2px);' +
      '-webkit-backdrop-filter:blur(2px);pointer-events:auto;';

    var label = document.createElement('span');
    label.textContent = 'Privacy';

    var detail = document.createElement('div');
    detail.style.cssText =
      'display:none;position:absolute;bottom:24px;right:0;width:280px;' +
      'background:rgba(15,15,20,0.96);color:rgba(255,255,255,0.85);' +
      'padding:10px 12px;border-radius:6px;font-size:11px;line-height:1.45;' +
      'box-shadow:0 6px 16px rgba(0,0,0,0.4);text-align:left;';
    detail.textContent =
      'This page uses an anonymous device ID (stored in your browser only) ' +
      'to count unique visits to the show. No cookies, no tracking across ' +
      'sites, no personal info collected. Clear your browser data to reset.';

    wrap.appendChild(label);
    wrap.appendChild(detail);

    var open = false;
    wrap.addEventListener('click', function (e) {
      e.stopPropagation();
      open = !open;
      detail.style.display = open ? 'block' : 'none';
    });
    document.addEventListener('click', function () {
      if (open) {
        open = false;
        detail.style.display = 'none';
      }
    });

    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountPrivacyNote);
  } else {
    mountPrivacyNote();
  }
})();
