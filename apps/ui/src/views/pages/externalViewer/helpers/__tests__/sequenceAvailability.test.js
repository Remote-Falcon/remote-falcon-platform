import { describe, it, expect } from 'vitest';

import { effectiveNightlyLimit, isNightlyCapped, isSequenceUnavailable } from '../sequenceAvailability';

// This is the deliberate mirror of NightlyPlayLimitHelperTest (libs/schema).
// The same null / 0 / >0 matrix is asserted on both sides because three
// separate call sites decide whether a song is capped — the plugin's play
// selection, the viewer's request rejection, and this gray-out. If they
// disagree, a viewer either sees a song they can't actually request, or
// requests one that is then silently skipped.
//
// Changing a case here without changing it there (or vice versa) is the bug
// this pair exists to catch.

const category = (name, nightlyPlayLimit) => ({ name, nightlyPlayLimit });
const seq = (categoryName, playsToday, extra = {}) => ({
  name: 'song',
  category: categoryName,
  playsToday,
  ...extra
});

describe('effectiveNightlyLimit', () => {
  it('inherits the show limit when the category sets none', () => {
    expect(effectiveNightlyLimit(3, 'Classic', [category('Classic', null)])).toBe(3);
    expect(effectiveNightlyLimit(3, 'Classic', [category('Classic', undefined)])).toBe(3);
  });

  it('exempts the category when it sets 0', () => {
    expect(effectiveNightlyLimit(3, 'Kids', [category('Kids', 0)])).toBe(0);
  });

  it('lets a category override the show limit', () => {
    expect(effectiveNightlyLimit(3, 'Classic', [category('Classic', 7)])).toBe(7);
  });

  it('applies an override even when the show sets no limit', () => {
    expect(effectiveNightlyLimit(null, 'Novelty', [category('Novelty', 2)])).toBe(2);
    expect(effectiveNightlyLimit(0, 'Novelty', [category('Novelty', 2)])).toBe(2);
  });

  it('uses the show limit for uncategorized songs', () => {
    expect(effectiveNightlyLimit(3, null, [category('Kids', 0)])).toBe(3);
    expect(effectiveNightlyLimit(3, '', [category('Kids', 0)])).toBe(3);
  });

  it('falls back to the show limit for a category that no longer exists', () => {
    // Renaming or deleting a category must not silently exempt its songs.
    expect(effectiveNightlyLimit(3, 'Deleted', [category('Kids', 0)])).toBe(3);
  });

  it('matches the category name case-insensitively', () => {
    expect(effectiveNightlyLimit(3, 'kids', [category('Kids', 0)])).toBe(0);
  });

  it('tolerates a missing or malformed category list', () => {
    expect(effectiveNightlyLimit(3, 'Classic', null)).toBe(3);
    expect(effectiveNightlyLimit(3, 'Classic', [])).toBe(3);
    expect(effectiveNightlyLimit(3, 'Classic', [null, category(null, 0), category('Classic', 5)])).toBe(5);
  });

  it('returns null when nothing sets a limit', () => {
    expect(effectiveNightlyLimit(null, 'Classic', [category('Classic', null)])).toBeNull();
  });
});

describe('isNightlyCapped', () => {
  it('caps once plays reach the show limit', () => {
    const categories = [category('Classic', null)];
    expect(isNightlyCapped(seq('Classic', 2), 3, categories)).toBe(false);
    expect(isNightlyCapped(seq('Classic', 3), 3, categories)).toBe(true);
    expect(isNightlyCapped(seq('Classic', 4), 3, categories)).toBe(true);
  });

  it('never caps an exempt category', () => {
    // The point of the feature: the crowd favourite keeps playing.
    expect(isNightlyCapped(seq('Kids', 99), 3, [category('Kids', 0)])).toBe(false);
  });

  it('uses the category threshold when it overrides', () => {
    const categories = [category('Classic', 7)];
    expect(isNightlyCapped(seq('Classic', 6), 3, categories)).toBe(false);
    expect(isNightlyCapped(seq('Classic', 7), 3, categories)).toBe(true);
  });

  it('never caps when no limit applies', () => {
    expect(isNightlyCapped(seq('Classic', 99), null, [])).toBe(false);
    expect(isNightlyCapped(seq('Classic', 99), 0, [])).toBe(false);
  });

  it('never caps before anything has played', () => {
    const categories = [category('Classic', null)];
    expect(isNightlyCapped(seq('Classic', null), 3, categories)).toBe(false);
    expect(isNightlyCapped(seq('Classic', 0), 3, categories)).toBe(false);
  });

  // The viewer query collapses a group to ONE representative row and never
  // sends the other members, so the client cannot scan them. The server stamps
  // that row's playsToday when the group is capped, and these pin that the
  // stamped row then reads as capped like any other sequence.
  it('treats a stamped group row as capped', () => {
    const entry = seq('Classic', 3, { group: 'Sing-alongs' });
    expect(isNightlyCapped(entry, 3, [category('Classic', null)])).toBe(true);
  });

  it('leaves an unstamped group row available', () => {
    const entry = seq('Classic', 1, { group: 'Sing-alongs' });
    expect(isNightlyCapped(entry, 3, [category('Classic', null)])).toBe(false);
  });

  it('resolves a group row against its own category like any other row', () => {
    const entry = seq('Kids', 99, { group: 'Mixed' });
    expect(isNightlyCapped(entry, 3, [category('Kids', 0)])).toBe(false);
  });

  it('tolerates a missing sequence', () => {
    expect(isNightlyCapped(null, 3, [])).toBe(false);
    expect(isNightlyCapped(undefined, 3, [])).toBe(false);
  });
});

describe('isSequenceUnavailable', () => {
  it('is true during the post-play cooldown regardless of the cap', () => {
    expect(isSequenceUnavailable(seq('Classic', 0, { visibilityCount: 2 }), 3, [])).toBe(true);
  });

  it('applies the cooldown to group entries too', () => {
    // Unlike the nightly cap, a group carries its own visibilityCount.
    const grouped = seq('Classic', 0, { visibilityCount: 1, group: 'Sing-alongs' });
    expect(isSequenceUnavailable(grouped, 3, [])).toBe(true);
  });

  it('is true when capped for the night', () => {
    expect(isSequenceUnavailable(seq('Classic', 3), 3, [category('Classic', null)])).toBe(true);
  });

  it('is false for an available song', () => {
    expect(isSequenceUnavailable(seq('Classic', 1), 3, [category('Classic', null)])).toBe(false);
  });

  it('is false for a song in an exempt category no matter how often it played', () => {
    expect(isSequenceUnavailable(seq('Kids', 99), 3, [category('Kids', 0)])).toBe(false);
  });
});
