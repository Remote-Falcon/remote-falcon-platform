import { describe, it, expect } from 'vitest';

import { strengthColor, strengthIndicatorNumFunc } from '../password-strength';

// Pin the strength scoring used by the registration form. The bands feed
// directly into the colored meter the user sees — a quiet off-by-one would
// flip a "Strong" password to "Good" or vice versa and erode trust.

describe('strengthIndicatorNumFunc', () => {
  it('returns 0 for an empty string (no meter shown)', () => {
    expect(strengthIndicatorNumFunc('')).toBe(0);
  });

  it('returns 1 for a very short password (just the base point)', () => {
    expect(strengthIndicatorNumFunc('a')).toBe(1);
  });

  it('adds a point once the password exceeds 5 characters', () => {
    expect(strengthIndicatorNumFunc('abcdef')).toBe(2);
  });

  it('adds another point past 7 characters', () => {
    expect(strengthIndicatorNumFunc('abcdefgh')).toBe(3);
  });

  it('rewards a numeric character', () => {
    // length=1 → 1 base + 1 number = 2
    expect(strengthIndicatorNumFunc('1')).toBe(2);
  });

  it('rewards a special character from the accepted set', () => {
    expect(strengthIndicatorNumFunc('!')).toBe(2);
  });

  it('rewards a mix of lower + upper case letters', () => {
    expect(strengthIndicatorNumFunc('aB')).toBe(2);
  });

  it('combines all bonuses for a strong-looking password', () => {
    // length=10 (+2), has number, has special, has mixed-case = 1 + 2 + 1 + 1 + 1 = 6
    expect(strengthIndicatorNumFunc('Abcdef1!gh')).toBe(6);
  });
});

describe('strengthColor', () => {
  it('returns Poor band for low scores (< 3)', () => {
    expect(strengthColor(0).label).toBe('Poor');
    expect(strengthColor(2).label).toBe('Poor');
  });

  it('returns Weak for 3', () => {
    expect(strengthColor(3).label).toBe('Weak');
  });

  it('returns Normal for 4', () => {
    expect(strengthColor(4).label).toBe('Normal');
  });

  it('returns Good for 5', () => {
    expect(strengthColor(5).label).toBe('Good');
  });

  it('returns Strong for 6', () => {
    expect(strengthColor(6).label).toBe('Strong');
  });

  it('returns Poor for 7+ (the documented degenerate fallback)', () => {
    expect(strengthColor(7).label).toBe('Poor');
  });

  it('includes a color value for every band', () => {
    for (const count of [0, 3, 4, 5, 6, 7]) {
      const { color } = strengthColor(count);
      // The scss module returns undefined in tests; ensure the key is at least present.
      expect(strengthColor(count)).toHaveProperty('color');
      // eslint-disable-next-line no-unused-expressions
      color;
    }
  });
});
