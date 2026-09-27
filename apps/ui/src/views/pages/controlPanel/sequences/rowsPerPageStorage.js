// Remembers the Sequences table page size between visits (#183). It used to
// be plain component state, so it reset to 25 on every navigation — painful
// for shows with a few hundred sequences during setup.
//
// A per-operator UI preference, so browser storage rather than the show
// document. Anything read back is checked against the offered options, since
// the table can't render a page size its selector doesn't list.

import safeStorage from '../../../../utils/safeStorage';

export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_ROWS_PER_PAGE = 25;
export const ROWS_PER_PAGE_STORAGE_KEY = 'rf-sequences-rows-per-page';

const isOffered = (value) => ROWS_PER_PAGE_OPTIONS.includes(value);

export const loadRowsPerPage = () => {
  const stored = Number(safeStorage.getItem(ROWS_PER_PAGE_STORAGE_KEY));
  return isOffered(stored) ? stored : DEFAULT_ROWS_PER_PAGE;
};

export const saveRowsPerPage = (value) => {
  if (!isOffered(value)) return;
  safeStorage.setItem(ROWS_PER_PAGE_STORAGE_KEY, String(value));
};
