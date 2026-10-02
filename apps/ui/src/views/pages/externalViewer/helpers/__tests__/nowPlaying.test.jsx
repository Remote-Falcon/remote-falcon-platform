import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { artistClassname, jukeboxQueueElements, playingSequenceElement } from '../nowPlaying';
import { ViewerControlMode } from '../../../../../utils/enum';

// #188: Now Playing, Next and the jukebox queue used to reuse the artist class
// of whichever sequence the main list loop was on (in practice the last
// visible one). Each label must now carry its own song's index.

const seq = (index, name, artist) => ({ index, name, displayName: `${name} (display)`, artist });

const artistDiv = (container) => container.querySelector('div');

describe('artistClassname', () => {
  it('keys the jukebox artist class by the sequence index', () => {
    expect(artistClassname(ViewerControlMode.JUKEBOX, { index: 7 })).toBe('jukebox-list-artist jukebox-list-artist-7');
  });

  it('keys the voting artist class by the sequence index', () => {
    expect(artistClassname(ViewerControlMode.VOTING, { index: 0 })).toBe(
      'cell-vote-playlist-artist cell-vote-playlist-artist-0'
    );
  });

  it('omits the keyed class when the sequence or its index is missing', () => {
    expect(artistClassname(ViewerControlMode.JUKEBOX, undefined)).toBe('jukebox-list-artist');
    expect(artistClassname(ViewerControlMode.VOTING, {})).toBe('cell-vote-playlist-artist');
  });
});

describe('playingSequenceElement', () => {
  it.each([
    [ViewerControlMode.JUKEBOX, 'jukebox-list-artist'],
    [ViewerControlMode.VOTING, 'cell-vote-playlist-artist']
  ])('keys Now Playing and Next by their own sequence in %s mode', (mode, base) => {
    const now = render(playingSequenceElement(mode, seq(2, 'Now', 'Artist A')));
    const next = render(playingSequenceElement(mode, seq(9, 'Next', 'Artist B')));

    const nowArtist = artistDiv(now.container);
    expect(nowArtist.className).toBe(`${base} ${base}-2`);
    expect(nowArtist.textContent).toBe('Artist A');
    expect(now.container.textContent).toContain('Now (display)');

    const nextArtist = artistDiv(next.container);
    expect(nextArtist.className).toBe(`${base} ${base}-9`);
    expect(nextArtist.textContent).toBe('Artist B');
  });
});

describe('jukeboxQueueElements', () => {
  it('skips the first request by position and keys each row by its own sequence', () => {
    // Deliberately out of position order to pin the sort.
    const requests = [
      { position: 3, sequence: seq(5, 'Third', 'C') },
      { position: 1, sequence: seq(11, 'First', 'A') },
      { position: 2, sequence: seq(4, 'Second', 'B') }
    ];
    const { container } = render(<>{jukeboxQueueElements(requests)}</>);

    const rows = container.querySelectorAll('.jukebox-queue');
    expect(rows).toHaveLength(2);

    const [second, third] = rows;
    expect(second.querySelector('.jukebox-queue-title').textContent).toBe('Second (display)');
    expect(second.querySelector('.jukebox-queue-artist').className).toBe(
      'jukebox-list-artist jukebox-list-artist-4 jukebox-queue-artist'
    );
    expect(third.querySelector('.jukebox-queue-title').textContent).toBe('Third (display)');
    expect(third.querySelector('.jukebox-queue-artist').className).toBe(
      'jukebox-list-artist jukebox-list-artist-5 jukebox-queue-artist'
    );
  });

  it('returns no rows for missing or single-entry requests', () => {
    expect(jukeboxQueueElements(undefined)).toEqual([]);
    expect(jukeboxQueueElements([{ position: 1, sequence: seq(1, 'Only', 'A') }])).toEqual([]);
  });

  it('does not throw when a queued request has no sequence', () => {
    const { container } = render(<>{jukeboxQueueElements([{ position: 1 }, { position: 2 }])}</>);
    expect(container.querySelector('.jukebox-queue-artist').className).toBe('jukebox-list-artist jukebox-queue-artist');
  });
});
