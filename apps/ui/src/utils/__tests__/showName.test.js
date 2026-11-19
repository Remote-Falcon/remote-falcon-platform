import { describe, expect, it } from 'vitest';

import { SHOW_NAME_RULE, showNameError } from '../showName';

describe('showNameError (#217)', () => {
  it.each(['My Show', 'Lights123', 'x-lights', 'Barrington-NJ Lights', 'A'])('accepts %s', (name) => {
    expect(showNameError(name)).toBeNull();
  });

  it.each(["Matty's Lights", 'walltown.remotefalcon', 'casa22/07/2025', 'Lights!', 'Show_Name', 'Café Lights', 'a@b'])(
    'rejects %s',
    (name) => {
      expect(showNameError(name)).toBe(SHOW_NAME_RULE);
    }
  );

  it('rejects empty and missing names', () => {
    expect(showNameError('')).toBe(SHOW_NAME_RULE);
    expect(showNameError(undefined)).toBe(SHOW_NAME_RULE);
  });

  it('rejects a leading or trailing hyphen', () => {
    expect(showNameError('-lights')).toMatch(/hyphen/);
    expect(showNameError('lights-')).toMatch(/hyphen/);
    expect(showNameError(' - ')).toMatch(/hyphen/);
  });

  it('caps the subdomain at 63 characters, not counting spaces', () => {
    expect(showNameError('a'.repeat(63))).toBeNull();
    expect(showNameError('a'.repeat(64))).toMatch(/too long/);
    expect(showNameError(`${'a'.repeat(40)} ${'b'.repeat(23)}`)).toBeNull();
  });
});
