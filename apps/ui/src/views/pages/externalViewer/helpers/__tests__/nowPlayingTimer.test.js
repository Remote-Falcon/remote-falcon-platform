import { describe, it, expect } from 'vitest';

import { initialNowPlayingState, nextNowPlayingState } from '../helpers';

// The viewer's {NOW_PLAYING_TIMER} is a 1Hz client-side countdown. The old
// implementation ran two independent `if` blocks per tick (reset + decrement);
// on a song-change tick BOTH fired and React's last-write-wins dropped the
// reset whenever the prior timer was still > 0. That left the countdown stuck
// on the previous song after an early interruption (issue #155): "works on
// normal playback (songs end at ~0), breaks on interrupt (timer still > 0)".
//
// nextNowPlayingState makes the branches mutually exclusive: a tick either
// clears, reseeds, or decrements — never reseeds AND decrements together.

const seq = (displayName, duration) => ({ displayName, duration });

describe('nextNowPlayingState', () => {
  it('clears when nothing is playing (empty / space / undefined)', () => {
    for (const playingNow of ['', ' ', undefined, null]) {
      expect(nextNowPlayingState({ nowPlaying: 'Old', nowPlayingTimer: 42 }, { playingNow })).toEqual({
        nowPlaying: '',
        nowPlayingTimer: 0,
      });
    }
  });

  it('reseeds to the new sequence duration on a song change when the timer was 0 (normal playback)', () => {
    expect(
      nextNowPlayingState(
        { nowPlaying: '', nowPlayingTimer: 0 },
        { playingNow: 'Linus', playingNowSequence: seq('Linus', 169) }
      )
    ).toEqual({ nowPlaying: 'Linus', nowPlayingTimer: 167 });
  });

  // The regression guard for #155: an interrupt arrives while the previous
  // song's timer is still counting. The reset MUST win — the timer must jump
  // to the new (short) song's duration, NOT keep counting the previous song.
  it('reseeds on a song change even when the previous timer is still > 0 (interrupt)', () => {
    expect(
      nextNowPlayingState(
        { nowPlaying: 'Linus', nowPlayingTimer: 140 },
        { playingNow: 'Tune', playingNowSequence: seq('Tune', 33) }
      )
    ).toEqual({ nowPlaying: 'Tune', nowPlayingTimer: 31 });
  });

  it('falls back to the sequences list (matched by displayName) when playingNowSequence is absent', () => {
    expect(
      nextNowPlayingState(
        { nowPlaying: '', nowPlayingTimer: 0 },
        { playingNow: 'Tune', sequences: [seq('Other', 10), seq('Tune', 50)] }
      )
    ).toEqual({ nowPlaying: 'Tune', nowPlayingTimer: 48 });
  });

  it('decrements by one while the same song keeps playing', () => {
    expect(nextNowPlayingState({ nowPlaying: 'Tune', nowPlayingTimer: 31 }, { playingNow: 'Tune' })).toEqual({
      nowPlaying: 'Tune',
      nowPlayingTimer: 30,
    });
  });

  it('floors the countdown at 0 and never goes negative', () => {
    expect(nextNowPlayingState({ nowPlaying: 'Tune', nowPlayingTimer: 0 }, { playingNow: 'Tune' })).toEqual({
      nowPlaying: 'Tune',
      nowPlayingTimer: 0,
    });
  });

  it('seeds to 0 (never NaN or negative) when the duration is missing or tiny', () => {
    expect(
      nextNowPlayingState({ nowPlaying: '', nowPlayingTimer: 0 }, { playingNow: 'NoDur', playingNowSequence: {} })
        .nowPlayingTimer
    ).toBe(0);
    expect(
      nextNowPlayingState(
        { nowPlaying: '', nowPlayingTimer: 0 },
        { playingNow: 'Blip', playingNowSequence: seq('Blip', 1) }
      ).nowPlayingTimer
    ).toBe(0);
  });
});

// #206: a viewer who opened or refreshed the page mid-song saw 0:00 until the
// next song. The page seeded nowPlaying from the first getShow but left the
// timer at 0, so every later tick took the "same song" branch and decremented
// a 0. The server sends no start time, so the best the page can do is start
// from the song's duration, the same as on a song change.
describe('initialNowPlayingState', () => {
  it('seeds the timer from the playing song duration on page load', () => {
    expect(initialNowPlayingState({ playingNow: 'Linus', playingNowSequence: seq('Linus', 169) })).toEqual({
      nowPlaying: 'Linus',
      nowPlayingTimer: 167,
    });
  });

  it('falls back to the sequences list when playingNowSequence is absent', () => {
    expect(initialNowPlayingState({ playingNow: 'Tune', sequences: [seq('Tune', 50)] })).toEqual({
      nowPlaying: 'Tune',
      nowPlayingTimer: 48,
    });
  });

  it('starts empty when nothing is playing', () => {
    expect(initialNowPlayingState({ playingNow: '' })).toEqual({ nowPlaying: '', nowPlayingTimer: 0 });
    expect(initialNowPlayingState(undefined)).toEqual({ nowPlaying: '', nowPlayingTimer: 0 });
  });

  it('keeps counting down on the next tick instead of sticking at 0', () => {
    const show = { playingNow: 'Linus', playingNowSequence: seq('Linus', 169) };
    expect(nextNowPlayingState(initialNowPlayingState(show), show)).toEqual({
      nowPlaying: 'Linus',
      nowPlayingTimer: 166,
    });
  });
});
