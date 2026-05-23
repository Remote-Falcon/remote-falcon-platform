import { describe, it, expect } from 'vitest';

import { buildPsaSequencesFromAutocompleteValue } from './InteractionSettings';

// Bug #66: removing a PSA from the Autocomplete only updated local
// state — the save fired on onBlur, the X-button doesn't blur, and the
// dispatch's `{ ...psaSequences }` spread corrupted the array shape so
// the next re-derivation showed unstable ordering. These tests pin the
// helper's output shape so a future refactor can't silently regress
// either issue.

describe('buildPsaSequencesFromAutocompleteValue', () => {
  it('returns empty arrays when value is empty', () => {
    const { seqs, selected } = buildPsaSequencesFromAutocompleteValue([]);
    expect(seqs).toEqual([]);
    expect(selected).toEqual([]);
  });

  it('returns empty arrays when value is null/undefined (defensive)', () => {
    expect(buildPsaSequencesFromAutocompleteValue(null)).toEqual({ seqs: [], selected: [] });
    expect(buildPsaSequencesFromAutocompleteValue(undefined)).toEqual({ seqs: [], selected: [] });
  });

  it('returns arrays (not objects keyed by index) — the #66 regression guard', () => {
    const { seqs, selected } = buildPsaSequencesFromAutocompleteValue([
      { label: 'Announcement', id: 'Announcement' }
    ]);
    expect(Array.isArray(seqs)).toBe(true);
    expect(Array.isArray(selected)).toBe(true);
  });

  it('normalizes order to 0..N-1 regardless of input', () => {
    const { seqs } = buildPsaSequencesFromAutocompleteValue([
      { label: 'A', id: 'A' },
      { label: 'B', id: 'B' },
      { label: 'C', id: 'C' }
    ]);
    expect(seqs.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('maps autocomplete label to both seqs.name and selected.label/id', () => {
    const { seqs, selected } = buildPsaSequencesFromAutocompleteValue([
      { label: 'Announcement', id: 'Announcement' }
    ]);
    expect(seqs[0].name).toBe('Announcement');
    expect(selected[0]).toEqual({ label: 'Announcement', id: 'Announcement' });
  });

  it('stamps lastPlayed on every entry (server expects an ISO-like string)', () => {
    const { seqs } = buildPsaSequencesFromAutocompleteValue([
      { label: 'A', id: 'A' },
      { label: 'B', id: 'B' }
    ]);
    seqs.forEach((s) => {
      expect(typeof s.lastPlayed).toBe('string');
      expect(s.lastPlayed.length).toBeGreaterThan(0);
    });
  });

  it('drops items when value shrinks — the removal path that #66 cared about', () => {
    // Simulate: user had ["A", "B"], clicked X on "A". Autocomplete fires
    // onChange with value = [{label: "B", ...}]. Helper should return
    // exactly one seq.
    const { seqs, selected } = buildPsaSequencesFromAutocompleteValue([
      { label: 'B', id: 'B' }
    ]);
    expect(seqs).toHaveLength(1);
    expect(selected).toHaveLength(1);
    expect(seqs[0].name).toBe('B');
    expect(seqs[0].order).toBe(0);
  });
});
