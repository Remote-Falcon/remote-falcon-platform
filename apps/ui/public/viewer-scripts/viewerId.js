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

    // #180: the wrapper only positions. The visible pill is itself a real
    // <button> (tab stop, Enter/Space, aria-expanded). Its hit area is exactly
    // what you see, at least 24x24 (WCAG 2.5.8 AA), with no invisible overhang:
    // templates may put their own controls in this corner, and taps there must
    // not open the note. The bottom-chrome clearance below still applies to
    // the wrapper unchanged.
    var wrap = document.createElement('div');
    wrap.id = 'rf-privacy-note';
    // The bottom offset is a variable so a template carrying its own bottom
    // chrome can lift the note clear of it. dynamic-menu's fixed nav bar sits
    // exactly where this note lands, and because the note is click-to-expand
    // it also swallowed taps meant for the menu underneath it.
    //
    // Keep the value in px. Custom properties resolve at the point of USE, so
    // an em value resolves against THIS note's 10px font-size rather than the
    // template's root size — a template asking for "4em" of clearance would
    // silently get 40px instead of the 64px it meant.
    wrap.style.cssText =
      'position:fixed;bottom:var(--rf-privacy-offset, 6px);right:8px;z-index:2147483647;' +
      'font-family:system-ui,-apple-system,sans-serif;font-size:10px;' +
      'line-height:1.2;pointer-events:auto;';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'rf-privacy-toggle rf-privacy-pill';
    toggle.textContent = 'Privacy';
    toggle.setAttribute('aria-label', 'Privacy notice');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'rf-privacy-detail');
    // Same look as the old pill. Padding grows from 3px 7px to 6px 9px so the
    // pill is 24px tall (12px of text plus 12px padding); min-width/min-height
    // hold 24x24 even if a template shrinks the font. display:flex keeps the
    // button block-level so the wrapper is exactly its size (an inline button
    // would sit in a line box with descender space below it).
    toggle.style.cssText =
      'display:flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'min-width:24px;min-height:24px;margin:0;padding:6px 9px;border:0;' +
      'color:rgba(255,255,255,0.5);background:rgba(0,0,0,0.35);border-radius:999px;' +
      'font:inherit;line-height:1.2;cursor:pointer;user-select:none;' +
      '-webkit-appearance:none;appearance:none;' +
      'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);';

    // Inline styles can't express :focus-visible, so the focus ring is a
    // one-off stylesheet. White inside dark so it shows on any page colour.
    // The browser's own outline is dropped only where :focus-visible exists
    // (an older browser ignores the whole rule and keeps its default ring).
    if (!document.getElementById('rf-privacy-note-style')) {
      var focusStyle = document.createElement('style');
      focusStyle.id = 'rf-privacy-note-style';
      focusStyle.textContent =
        '#rf-privacy-note .rf-privacy-toggle:focus:not(:focus-visible){outline:none;}' +
        '#rf-privacy-note .rf-privacy-toggle:focus-visible{' +
        'outline:2px solid #fff;box-shadow:0 0 0 4px rgba(0,0,0,0.85);color:#fff;}';
      (document.head || document.body).appendChild(focusStyle);
    }

    var detail = document.createElement('div');
    detail.id = 'rf-privacy-detail';
    // 30px = the 24px pill plus the old 6px gap.
    detail.style.cssText =
      'display:none;position:absolute;bottom:30px;right:0;width:280px;' +
      'background:rgba(15,15,20,0.96);color:rgba(255,255,255,0.85);' +
      'padding:10px 12px;border-radius:6px;font-size:11px;line-height:1.45;' +
      'box-shadow:0 6px 16px rgba(0,0,0,0.4);text-align:left;';
    detail.textContent =
      'This page uses an anonymous device ID (stored in your browser only) ' +
      'to count unique visits to the show. No cookies, no tracking across ' +
      'sites, no personal info collected. Clear your browser data to reset.';

    wrap.appendChild(toggle);
    wrap.appendChild(detail);

    var open = false;
    function setOpen(next) {
      open = next;
      detail.style.display = open ? 'block' : 'none';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    // On the wrapper, so a click on the open panel closes it as it always has.
    // The button turns Enter and Space into a click on its own.
    wrap.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!open);
    });
    document.addEventListener('click', function () {
      if (open) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (!open || (e.key !== 'Escape' && e.key !== 'Esc')) return;
      setOpen(false);
      if (wrap.contains(document.activeElement)) toggle.focus();
    });

    document.body.appendChild(wrap);
    applyBottomChromeClearance(wrap);

    // Re-measure once after load: a template's own script can inject or
    // restyle its nav bar after DOMContentLoaded, and web fonts can change
    // its height after first paint.
    setTimeout(function () {
      applyBottomChromeClearance(wrap);
    }, 1200);

    var resizeRaf = 0;
    window.addEventListener('resize', function () {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(function () {
        resizeRaf = 0;
        applyBottomChromeClearance(wrap);
      });
    });
  }

  // Lift the note above any bottom chrome the page already has (a fixed nav
  // bar, a floating button) so it neither hides behind it nor, because the
  // note is click-to-expand, swallows taps aimed at it.
  //
  // This is measured here rather than set in the templates because templates
  // are COPIED into each show's page: changing a template only helps shows
  // created afterwards, while every operator already running it would have to
  // hand-edit their own page. This script is served centrally, so measuring
  // fixes existing shows on their next load.
  // How far above the viewport bottom an element can sit and still count as
  // bottom chrome. Covers the usual floating-button offsets and iOS safe-area
  // insets, while staying well clear of ordinary page content.
  var BOTTOM_ANCHOR_SLACK = 96;

  function measureBottomChrome(wrap) {
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    if (!vh || !vw) return 0;

    var clearance = 0;
    // Bottom chrome is conventionally a top-level element (dynamic-menu's
    // <menu class="rf_menu"> is a direct child of body), so a shallow scan
    // is enough and avoids walking a song list of any size.
    var children = document.body.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (el === wrap) continue;

      var cs;
      try {
        cs = window.getComputedStyle(el);
      } catch (e) {
        continue;
      }
      if (!cs) continue;
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;

      var r = el.getBoundingClientRect();
      if (!r.height || !r.width) continue;
      // Anchored NEAR the bottom of the viewport, deliberately not flush with
      // it: a floating action button normally sits at bottom:16-24px, and in
      // the original report it was a button like that, not the nav bar,
      // sitting under the note. Demanding a flush edge skipped it entirely.
      if (r.bottom < vh - BOTTOM_ANCHOR_SLACK) continue;
      // A full-height overlay is not chrome to clear — skip it, or the note
      // would fly to the top of the screen.
      if (r.height > vh * 0.25) continue;
      // Only chrome that actually reaches this note's corner matters; a
      // bottom-LEFT element doesn't overlap it.
      if (r.right < vw - 80) continue;

      // Measure from the viewport bottom up to the TOP of the chrome, not the
      // chrome's own height: an element offset from the bottom needs its
      // height AND that offset cleared.
      clearance = Math.max(clearance, vh - r.top);
    }
    return clearance;
  }

  function applyBottomChromeClearance(wrap) {
    // An explicit --rf-privacy-offset from the page always wins; it's the
    // documented way to override this, so don't fight it.
    var explicit = '';
    try {
      explicit = window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--rf-privacy-offset')
        .trim();
    } catch (e) {
      explicit = '';
    }
    if (explicit) return;

    var clearance = measureBottomChrome(wrap);
    if (clearance > 0) {
      wrap.style.bottom = clearance + 8 + 'px';
    } else {
      // Restore the var() reference rather than writing a literal 6px, so a
      // page that sets --rf-privacy-offset later (or chrome that disappears
      // on resize) still gets the declared value on the next measure.
      wrap.style.bottom = 'var(--rf-privacy-offset, 6px)';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountPrivacyNote);
  } else {
    mountPrivacyNote();
  }
})();
