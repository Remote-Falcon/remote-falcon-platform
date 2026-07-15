import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import safeStorage from '../safeStorage';

// Browsers with site data blocked (strict privacy settings, sandboxed
// iframes) throw a SecurityError on ANY access to window.localStorage —
// including the property read itself. safeStorage is the shared guard:
// callers get null/false/no-op instead of a throw. Born from PostHog
// issues 019f5c1d-85a6 (ConfigProvider) and 019f61db-7fe2 (JWTContext).

describe('safeStorage', () => {
  describe('with working storage', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it('round-trips a value', () => {
      expect(safeStorage.setItem('k1', 'v1')).toBe(true);
      expect(safeStorage.getItem('k1')).toBe('v1');
    });

    it('returns null for a missing key', () => {
      expect(safeStorage.getItem('nope')).toBeNull();
    });

    it('removeItem deletes the key', () => {
      safeStorage.setItem('k2', 'v2');
      safeStorage.removeItem('k2');
      expect(safeStorage.getItem('k2')).toBeNull();
    });
  });

  describe('when localStorage access is blocked', () => {
    let restore;

    beforeEach(() => {
      const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException(
            "Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
            'SecurityError'
          );
        }
      });
      restore = () => Object.defineProperty(window, 'localStorage', original);
    });

    afterEach(() => {
      restore();
    });

    it('getItem returns null instead of throwing', () => {
      expect(safeStorage.getItem('anything')).toBeNull();
    });

    it('setItem returns false instead of throwing', () => {
      expect(safeStorage.setItem('anything', 'v')).toBe(false);
    });

    it('removeItem is a silent no-op', () => {
      expect(() => safeStorage.removeItem('anything')).not.toThrow();
    });
  });
});
