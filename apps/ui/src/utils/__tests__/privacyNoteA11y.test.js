import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// #180 - the vendored privacy note (public/viewer-scripts/viewerId.js) was a
// bare <div> toggle: no role, no tab stop, no keys, about 47x18px. These pin
// its semantics. privacyNoteOffset.test.js covers its position.

const SCRIPT_PATH = path.resolve(__dirname, '../../../public/viewer-scripts/viewerId.js');
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, 'utf8');

const runScript = () => {
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT_SOURCE)();
};

const note = () => document.getElementById('rf-privacy-note');
const toggle = () => note().querySelector('button');
const detail = () => document.getElementById(toggle().getAttribute('aria-controls'));
const isOpen = () => toggle().getAttribute('aria-expanded') === 'true';

describe('privacy note accessibility', () => {
  beforeEach(() => {
    window.innerWidth = 400;
    window.innerHeight = 800;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    runScript();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is a real button, so keyboards and screen readers can reach and press it', () => {
    expect(toggle()).not.toBeNull();
    expect(toggle().getAttribute('type')).toBe('button');
    expect(toggle().textContent).toContain('Privacy');
    expect(toggle().getAttribute('aria-label') || toggle().textContent).toMatch(/Privacy/);
  });

  it('points aria-controls at the detail panel and starts collapsed', () => {
    expect(detail()).not.toBeNull();
    expect(note().contains(detail())).toBe(true);
    expect(isOpen()).toBe(false);
    expect(detail().style.display).toBe('none');
  });

  it('toggles open and closed on activation, keeping aria-expanded in step', () => {
    // A native button turns Enter and Space into click, so click covers the keyboard.
    toggle().click();
    expect(isOpen()).toBe(true);
    expect(detail().style.display).toBe('block');
    toggle().click();
    expect(isOpen()).toBe(false);
    expect(detail().style.display).toBe('none');
  });

  it('closes on Escape and leaves focus on the button', () => {
    toggle().focus();
    toggle().click();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isOpen()).toBe(false);
    expect(detail().style.display).toBe('none');
    expect(document.activeElement).toBe(toggle());
  });

  it('still closes on an outside click', () => {
    toggle().click();
    document.body.click();
    expect(isOpen()).toBe(false);
  });

  it('still closes when the open panel itself is clicked, as before', () => {
    toggle().click();
    detail().click();
    expect(isOpen()).toBe(false);
  });

  it('makes the visible pill itself the button, at least 24x24px (WCAG 2.5.8)', () => {
    const style = toggle().style;
    expect(parseInt(style.minWidth, 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(style.minHeight, 10)).toBeGreaterThanOrEqual(24);
    // 12px of text (10px font x 1.2) plus vertical padding reaches 24px.
    const [padY] = style.padding.split(' ').map((v) => parseInt(v, 10));
    expect(10 * 1.2 + 2 * padY).toBeGreaterThanOrEqual(24);
    // The pill look lives on the button, not on an inner element.
    expect(style.background).toContain('rgba(0, 0, 0, 0.35)');
    expect(style.borderRadius).toBe('999px');
  });

  it('has no invisible hit area beyond the pill', () => {
    // No 44px min size, no transparent child: the button is the only thing
    // in the wrapper besides the hidden detail panel.
    expect(parseInt(toggle().style.minHeight, 10)).toBeLessThan(44);
    expect(toggle().children).toHaveLength(0);
    expect(Array.from(note().children)).toEqual([toggle(), detail()]);
    expect(note().style.padding).toBe('');
  });

  it('ships a visible focus style for the button', () => {
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent)
      .join('\n');
    expect(css).toMatch(/#rf-privacy-note[^{]*:focus-visible[^{]*\{[^}]*outline:/);
  });

  it('does not put aria-label on the role-less wrapper', () => {
    expect(note().hasAttribute('aria-label')).toBe(false);
  });
});
