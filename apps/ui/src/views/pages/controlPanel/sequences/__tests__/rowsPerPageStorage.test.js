import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ROWS_PER_PAGE,
  ROWS_PER_PAGE_OPTIONS,
  ROWS_PER_PAGE_STORAGE_KEY,
  loadRowsPerPage,
  saveRowsPerPage
} from '../rowsPerPageStorage';

// #183: the Sequences page-size selector reset to 25 on every visit. These
// pin that the choice survives, and that nothing read back from storage can
// hand the table a page size it doesn't offer.

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('loadRowsPerPage', () => {
  it('defaults to 25 when nothing is stored', () => {
    expect(DEFAULT_ROWS_PER_PAGE).toBe(25);
    expect(loadRowsPerPage()).toBe(25);
  });

  it('restores every offered option', () => {
    ROWS_PER_PAGE_OPTIONS.forEach((option) => {
      window.localStorage.setItem(ROWS_PER_PAGE_STORAGE_KEY, String(option));
      expect(loadRowsPerPage()).toBe(option);
    });
  });

  it('falls back to the default for values the table does not offer', () => {
    ['7', '1000', '0', '-25', 'abc', '25.5', '', 'null'].forEach((junk) => {
      window.localStorage.setItem(ROWS_PER_PAGE_STORAGE_KEY, junk);
      expect(loadRowsPerPage()).toBe(DEFAULT_ROWS_PER_PAGE);
    });
  });

  it('falls back to the default when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(loadRowsPerPage()).toBe(DEFAULT_ROWS_PER_PAGE);
  });
});

describe('saveRowsPerPage', () => {
  it('round-trips through load', () => {
    saveRowsPerPage(100);
    expect(loadRowsPerPage()).toBe(100);
  });

  it('ignores values the table does not offer', () => {
    saveRowsPerPage(50);
    saveRowsPerPage(7);
    saveRowsPerPage(Number.NaN);
    expect(loadRowsPerPage()).toBe(50);
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => saveRowsPerPage(100)).not.toThrow();
  });
});
