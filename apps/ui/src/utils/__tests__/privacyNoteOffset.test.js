import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Exercises the vendored public/viewer-scripts/viewerId.js privacy note.
//
// The note is fixed to the bottom-right. Templates that carry their own
// bottom chrome (dynamic-menu's fixed nav bar, a floating button) put that
// chrome in exactly the same place, so the note landed on top of it and,
// being click-to-expand, swallowed taps meant for it.
//
// The measurement lives in the centrally-served script rather than in the
// templates because templates are COPIED into each show's page: a template
// edit only reaches shows created afterwards. These tests pin the geometry
// rules that decide how far the note lifts.

const SCRIPT_PATH = path.resolve(__dirname, '../../../public/viewer-scripts/viewerId.js');
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, 'utf8');

const VIEWPORT_W = 400;
const VIEWPORT_H = 800;

/** Run the vendored IIFE against the current jsdom document. */
const runScript = () => {
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT_SOURCE)();
};

/**
 * Append a bottom-anchored element and give it a layout box, since jsdom
 * does no layout and returns an all-zero rect on its own.
 */
const addChrome = ({ height, right = VIEWPORT_W, bottom = VIEWPORT_H, position = 'fixed', width = VIEWPORT_W }) => {
  const el = document.createElement('menu');
  el.style.position = position;
  document.body.appendChild(el);
  el.getBoundingClientRect = () => ({
    height,
    width,
    bottom,
    top: bottom - height,
    right,
    left: right - width,
    x: right - width,
    y: bottom - height
  });
  return el;
};

const noteBottom = () => document.getElementById('rf-privacy-note')?.style.bottom;

describe('privacy note bottom-chrome clearance', () => {
  beforeEach(() => {
    window.innerWidth = VIEWPORT_W;
    window.innerHeight = VIEWPORT_H;
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--rf-privacy-offset');
    delete window.__rfViewerId;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sits near the bottom when the page has no bottom chrome', () => {
    runScript();
    expect(noteBottom()).toBe('var(--rf-privacy-offset, 6px)');
  });

  it('lifts above a fixed bottom nav bar, clearing its full height', () => {
    // dynamic-menu reserves 3.5em (56px at root font size) for its nav.
    addChrome({ height: 56 });
    runScript();
    expect(noteBottom()).toBe('64px');
  });

  it('clears the tallest chrome when several are present', () => {
    addChrome({ height: 24 });
    addChrome({ height: 56 });
    runScript();
    expect(noteBottom()).toBe('64px');
  });

  it('clears a bottom-right floating button', () => {
    // The reported case: a circular FAB in the note's own corner.
    addChrome({ height: 48, width: 48, right: VIEWPORT_W - 8 });
    runScript();
    expect(noteBottom()).toBe('56px');
  });

  it('ignores a full-screen overlay so the note never flies up the page', () => {
    addChrome({ height: VIEWPORT_H });
    runScript();
    expect(noteBottom()).toBe('var(--rf-privacy-offset, 6px)');
  });

  it('ignores chrome anchored to the bottom-left, which never overlaps it', () => {
    addChrome({ height: 56, width: 60, right: 60 });
    runScript();
    expect(noteBottom()).toBe('var(--rf-privacy-offset, 6px)');
  });

  it('ignores elements that are not bottom-anchored', () => {
    // A fixed header: same height, wrong end of the viewport.
    addChrome({ height: 56, bottom: 56 });
    runScript();
    expect(noteBottom()).toBe('var(--rf-privacy-offset, 6px)');
  });

  it('ignores statically positioned elements that merely sit at the bottom', () => {
    addChrome({ height: 56, position: 'static' });
    runScript();
    expect(noteBottom()).toBe('var(--rf-privacy-offset, 6px)');
  });

  it('ignores hidden chrome', () => {
    const el = addChrome({ height: 56 });
    el.style.display = 'none';
    runScript();
    expect(noteBottom()).toBe('var(--rf-privacy-offset, 6px)');
  });

  it('honors an explicit --rf-privacy-offset instead of measuring', () => {
    // The documented override: whatever the page asks for wins, so a
    // template can tune it without fighting the measurement.
    document.documentElement.style.setProperty('--rf-privacy-offset', '120px');
    addChrome({ height: 56 });
    runScript();
    // Measurement must not overwrite it: the inline `bottom` keeps its
    // var() reference so CSS resolves the declared 120px.
    expect(noteBottom()).toBe('var(--rf-privacy-offset, 6px)');
  });
});
