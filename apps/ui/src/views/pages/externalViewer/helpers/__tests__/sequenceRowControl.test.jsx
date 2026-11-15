import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SEQUENCE_ROW_FOCUS_DEFAULT_CSS, sequenceRowControlProps } from '../sequenceRowControl';
import { sequenceRowContent, unavailableRowProps } from '../unavailableRow';

// #179 - song rows were roleless <div onClick>s, so keyboard, switch and
// screen-reader users could not request or vote for anything. The row keeps
// its element and class names (owner templates style them) and gains button
// semantics plus Enter/Space.

const SEQ = { name: 'linus', displayName: 'Linus and Lucy', artist: 'Vince Guaraldi', index: 4, visibilityCount: 0 };

// Mirrors how index.jsx builds a row: the handlers read data-key off e.target.
const renderRow = ({ unavailable = false, viewOnly = false, onActivate = vi.fn() } = {}) => {
  render(
    <div
      {...unavailableRowProps('jukebox-list jukebox-list-4', SEQ, unavailable)}
      {...sequenceRowControlProps({ onActivate, viewOnly, unavailable })}
      data-key={SEQ.name}
      data-key-2={SEQ.displayName}
    >
      {sequenceRowContent({ sequence: SEQ, image: null, artistClassName: 'jukebox-list-artist', unavailable })}
    </div>
  );
  return onActivate;
};

describe('sequenceRowControlProps', () => {
  it('makes an available row a focusable button named by its song', () => {
    renderRow();
    const row = screen.getByRole('button', { name: /Linus and Lucy/ });
    expect(row).toHaveAttribute('tabindex', '0');
    expect(row).not.toHaveAttribute('aria-disabled');
    expect(row).toHaveClass('jukebox-list', 'jukebox-list-4');
  });

  it.each([['Enter'], [' ']])('activates on %j with the row as the event target', (key) => {
    const onActivate = renderRow();
    const row = screen.getByRole('button');
    fireEvent.keyDown(row, { key });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].target.getAttribute('data-key')).toBe('linus');
  });

  it('stops Space from scrolling the page', () => {
    renderRow();
    const notCancelled = fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(notCancelled).toBe(false);
  });

  it('ignores other keys and auto-repeat', () => {
    const onActivate = renderRow();
    const row = screen.getByRole('button');
    fireEvent.keyDown(row, { key: 'a' });
    fireEvent.keyDown(row, { key: 'Tab' });
    fireEvent.keyDown(row, { key: 'Enter', repeat: true });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('still activates on click', () => {
    const onActivate = renderRow();
    fireEvent.click(screen.getByRole('button'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('keeps an unavailable row focusable, announces it disabled with its reason, and never activates it', () => {
    const onActivate = renderRow({ unavailable: true });
    const row = screen.getByRole('button', { name: /Linus and Lucy/ });
    expect(row).toHaveAttribute('tabindex', '0');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(row).toHaveAccessibleDescription('Back next show');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.click(row);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('leaves a view-only page row out of the tab order and without a button role', () => {
    const onActivate = renderRow({ viewOnly: true });
    expect(screen.queryByRole('button')).toBeNull();
    const row = document.querySelector('.jukebox-list');
    expect(row).not.toHaveAttribute('tabindex');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe('SEQUENCE_ROW_FOCUS_DEFAULT_CSS', () => {
  it('gives both row classes a visible focus-visible outline', () => {
    expect(SEQUENCE_ROW_FOCUS_DEFAULT_CSS).toContain('.cell-vote-playlist:focus-visible');
    expect(SEQUENCE_ROW_FOCUS_DEFAULT_CSS).toContain('.jukebox-list:focus-visible');
    expect(SEQUENCE_ROW_FOCUS_DEFAULT_CSS).toMatch(/outline:\s*\dpx solid/);
  });
});
