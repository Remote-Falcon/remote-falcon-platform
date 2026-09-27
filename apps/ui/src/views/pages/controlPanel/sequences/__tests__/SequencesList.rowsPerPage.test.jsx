import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { store } from '../../../../../store';
import { setShow } from '../../../../../store/slices/show';
import { ROWS_PER_PAGE_STORAGE_KEY } from '../rowsPerPageStorage';

vi.mock('../../../../../services/controlPanel/mutations.service', () => ({
  saveSequencesService: vi.fn(),
  saveSequenceGroupsService: vi.fn(),
  saveCategoriesService: vi.fn(),
  playSequenceFromControlPanelService: vi.fn(),
  forceNextSongService: vi.fn()
}));

// eslint-disable-next-line import/first
import SequencesList from '../SequencesList';

const theme = createTheme();

// More sequences than the default page size, so the page size is visible in
// the pagination label.
const sequences = Array.from({ length: 30 }, (_, i) => ({
  name: `Song ${i + 1}`,
  displayName: `Song ${i + 1}`,
  index: i,
  order: i,
  active: true,
  visible: true,
  artist: null,
  category: null,
  group: null,
  imageUrl: null,
  type: 'SEQUENCE'
}));

const renderList = () => {
  store.dispatch(
    setShow({ showToken: 't', showName: 'Demo', sequences, sequenceGroups: [], categories: [], psaSequences: [] })
  );
  return render(
    <Provider store={store}>
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <SequencesList />
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>
    </Provider>
  );
};

describe('SequencesList — rows per page survives a revisit (#183)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    store.dispatch(setShow(null));
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('starts at 25 on a first visit', () => {
    renderList();
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument();
  });

  it('restores the page size picked on an earlier visit', async () => {
    const user = userEvent.setup();
    const first = renderList();
    await user.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await user.click(await screen.findByRole('option', { name: '10' }));
    expect(screen.getByText('1–10 of 30')).toBeInTheDocument();
    expect(window.localStorage.getItem(ROWS_PER_PAGE_STORAGE_KEY)).toBe('10');

    // Navigating away unmounts the list; coming back mounts a fresh one.
    first.unmount();
    renderList();
    expect(screen.getByText('1–10 of 30')).toBeInTheDocument();
  });

  it('ignores a stored size the table does not offer', () => {
    window.localStorage.setItem(ROWS_PER_PAGE_STORAGE_KEY, '7');
    renderList();
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument();
  });
});
