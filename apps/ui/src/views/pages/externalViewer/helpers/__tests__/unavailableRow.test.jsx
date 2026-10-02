import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sequenceImage } from '../helpers';
import { isSequenceUnavailable } from '../sequenceAvailability';
import {
  UNAVAILABLE_HINT_CLASS,
  UNAVAILABLE_HINT_DEFAULT_CSS,
  UNAVAILABLE_ROW_CLASS,
  sequenceRowContent,
  unavailableHintId,
  unavailableHintText,
  unavailableRowProps
} from '../unavailableRow';

// #190 - the four song-row sites in externalViewer/index.jsx (voting,
// voting categorized, jukebox, jukebox categorized) build their rows from
// these helpers. Each site differs only in its class names and whether the row
// and artist carry data-key-2, so the harness below rebuilds each site's row
// the way index.jsx does and checks the hint is visible text, not a title.

const NOW = Date.parse('2026-12-20T03:00:00Z');
const FRESH = '2026-12-20T02:00:00';
const categories = [{ name: 'Classic', nightlyPlayLimit: null }];
const options = { lastPlayCountedAt: FRESH, now: NOW };

const SITES = {
  voting: { row: 'cell-vote-playlist cell-vote-playlist-4', artist: 'cell-vote-playlist-artist', dataKey2: true },
  'voting categorized': { row: 'cell-vote-playlist cell-vote-playlist-4', artist: 'cell-vote-playlist-artist', dataKey2: false },
  jukebox: { row: 'jukebox-list jukebox-list-4', artist: 'jukebox-list-artist', dataKey2: true },
  'jukebox categorized': { row: 'jukebox-list jukebox-list-4', artist: 'jukebox-list-artist', dataKey2: false }
};

const renderRow = (site, sequence, nightlyOptions = options) => {
  const unavailable = isSequenceUnavailable(sequence, 3, categories, nightlyOptions);
  const { container } = render(
    <div
      {...unavailableRowProps(site.row, sequence, unavailable)}
      data-key={sequence.name}
      {...(site.dataKey2 ? { 'data-key-2': sequence.displayName } : {})}
    >
      {sequenceRowContent({
        sequence,
        image: sequenceImage(sequence),
        artistClassName: site.artist,
        artistProps: site.dataKey2 ? { 'data-key-2': sequence.displayName } : {},
        unavailable
      })}
    </div>
  );
  return container.firstChild;
};

const song = (extra = {}) => ({
  name: 'Wizards in Winter (TSO)',
  displayName: 'Wizards in Winter',
  artist: 'Trans-Siberian Orchestra',
  imageUrl: 'https://example.com/art.png',
  index: 4,
  category: 'Classic',
  playsToday: 0,
  visibilityCount: 0,
  ...extra
});

const cases = [
  ['in cooldown', song({ visibilityCount: 2 }), 'Available again soon'],
  ['at its nightly cap', song({ playsToday: 3 }), 'Back next show']
];

describe.each(Object.entries(SITES))('%s row', (_label, site) => {
  it.each(cases)('shows the reason as visible text when %s', (_why, sequence, text) => {
    const row = renderRow(site, sequence);
    const hint = row.querySelector(`.${UNAVAILABLE_HINT_CLASS}`);

    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe(text);
    expect(row.hasAttribute('title')).toBe(false);
    expect(row.querySelector('[title]')).toBeNull();

    // The hint follows the artist line.
    expect(hint.previousElementSibling.className).toBe(site.artist);
    expect(row.lastElementChild).toBe(hint);
  });

  it.each(cases)('marks the row disabled and describes it by the hint when %s', (_why, sequence) => {
    const row = renderRow(site, sequence);
    const hint = row.querySelector(`.${UNAVAILABLE_HINT_CLASS}`);

    expect(row.classList.contains(UNAVAILABLE_ROW_CLASS)).toBe(true);
    site.row.split(' ').forEach((cls) => expect(row.classList.contains(cls)).toBe(true));
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.getAttribute('aria-describedby')).toBe(hint.id);
    expect(document.getElementById(hint.id)).toBe(hint);
  });

  it.each(cases)('dims the content, not the row or the hint, when %s', (_why, sequence) => {
    const row = renderRow(site, sequence);

    expect(row.style.pointerEvents).toBe('none');
    expect(row.style.opacity).toBe('');
    expect(row.querySelector('img.sequence-image').style.opacity).toBe('0.4');
    expect(row.querySelector('span').textContent).toBe(sequence.displayName);
    expect(row.querySelector('span').style.opacity).toBe('0.4');
    expect(row.querySelector(`.${site.artist}`).style.opacity).toBe('0.4');
    expect(row.querySelector(`.${UNAVAILABLE_HINT_CLASS}`).style.opacity).toBe('');
  });

  it('renders an available row exactly as before', () => {
    const sequence = song({ playsToday: 1 });
    const row = renderRow(site, sequence);

    expect(row.className).toBe(site.row);
    expect(row.getAttribute('style')).toBeNull();
    expect(row.hasAttribute('aria-disabled')).toBe(false);
    expect(row.hasAttribute('aria-describedby')).toBe(false);
    expect(row.querySelector(`.${UNAVAILABLE_HINT_CLASS}`)).toBeNull();
    expect(row.querySelector('span')).toBeNull();
    expect(row.querySelector('img').getAttribute('style')).toBeNull();
    expect(row.querySelector(`.${site.artist}`).getAttribute('style')).toBeNull();
    expect(row.querySelector(`.${site.artist}`).getAttribute('data-key-2')).toBe(site.dataKey2 ? sequence.displayName : null);
  });
});

describe('unavailable row helpers', () => {
  it('shows no hint for a stale cap from last night (#186)', () => {
    const row = renderRow(SITES.jukebox, song({ playsToday: 3 }), { lastPlayCountedAt: '2026-12-19T06:00:00', now: NOW });
    expect(row.querySelector(`.${UNAVAILABLE_HINT_CLASS}`)).toBeNull();
    expect(row.hasAttribute('aria-disabled')).toBe(false);
  });

  it('words the hint by cause', () => {
    expect(unavailableHintText({ visibilityCount: 1 })).toBe('Available again soon');
    expect(unavailableHintText({ visibilityCount: 0, playsToday: 9 })).toBe('Back next show');
    expect(unavailableHintText(null)).toBe('Back next show');
  });

  it('builds a valid, distinct id from free-text names', () => {
    const id = unavailableHintId({ name: 'Jingle "Bell" Rock / Remix #2', index: 7 });
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id).toBe('sequence-unavailable-hint-7-Jingle--Bell--Rock---Remix--2');
    expect(unavailableHintId({ name: 'a b', index: 1 })).not.toBe(unavailableHintId({ name: 'a-b', index: 2 }));
    expect(unavailableHintId({})).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('leaves a missing image alone', () => {
    const { container } = render(
      <div>{sequenceRowContent({ sequence: song({ imageUrl: null }), image: null, artistClassName: 'a', unavailable: true })}</div>
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector(`.${UNAVAILABLE_HINT_CLASS}`)).not.toBeNull();
  });

  it('ships the hint size as a zero-specificity default', () => {
    expect(UNAVAILABLE_HINT_DEFAULT_CSS).toBe(':where(.sequence-unavailable-hint) { font-size: 0.8em; }');
  });
});
