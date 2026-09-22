import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { store } from '../../../../../store';
import { setShow } from '../../../../../store/slices/show';

// Pin the save path the same way SequencesList.sortOrder.test.jsx does:
// mock the service (not the Apollo mutation) so the assertion is on the
// payload the component actually persists, not on GraphQL plumbing.
const saveCategoriesService = vi.fn((updated, _mutation, callback) =>
  callback({ success: true, toast: { message: 'Categories Saved' } })
);

vi.mock('../../../../../services/controlPanel/mutations.service', () => ({
  saveCategoriesService: (...args) => saveCategoriesService(...args),
  saveSequencesService: vi.fn((updated, _mutation, callback) => callback({ success: true })),
  saveSequenceGroupsService: vi.fn(),
  playSequenceFromControlPanelService: vi.fn(),
  forceNextSongService: vi.fn()
}));

// eslint-disable-next-line import/first
import Categories from '../Categories';

const theme = createTheme();

const category = (name, displayOrder, extra = {}) => ({
  name,
  displayOrder,
  requestLimit: 0,
  antiConsecutive: false,
  ...extra
});

// Deliberately not alphabetical, so an applied A→Z sort is visibly different
// from the starting (dashboard-drag) order.
const baseShow = {
  showToken: 't',
  showName: 'Demo',
  sequences: [],
  sequenceGroups: [],
  categories: [category('Soundtrack', 0), category('Classic', 1), category('Novelty', 2)],
  psaSequences: []
};

const renderCategories = () => {
  store.dispatch(setShow(baseShow));
  return render(
    <Provider store={store}>
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <Categories />
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>
    </Provider>
  );
};

describe('Categories — sort A→Z', () => {
  beforeEach(() => {
    saveCategoriesService.mockClear();
    store.dispatch(setShow(null));
  });

  it('saves categories alphabetized with displayOrder renumbered, after confirming', async () => {
    const user = userEvent.setup();
    renderCategories();

    await user.click(screen.getByRole('button', { name: /sort a→z/i }));
    // Confirm dialog guards the overwrite of the dashboard-dragged order.
    await user.click(await screen.findByRole('button', { name: /^sort a→z$/i }));

    await waitFor(() => expect(saveCategoriesService).toHaveBeenCalledTimes(1));
    const [saved] = saveCategoriesService.mock.calls[0];
    expect(saved.map((c) => [c.name, c.displayOrder])).toEqual([
      ['Classic', 0],
      ['Novelty', 1],
      ['Soundtrack', 2]
    ]);
  });

  it('does not save until the confirm dialog is accepted', async () => {
    const user = userEvent.setup();
    renderCategories();
    await user.click(screen.getByRole('button', { name: /sort a→z/i }));
    expect(saveCategoriesService).not.toHaveBeenCalled();
  });

  it('hides the sort control when there are fewer than 2 categories', () => {
    store.dispatch(setShow({ ...baseShow, categories: [category('Classic', 0)] }));
    render(
      <Provider store={store}>
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter>
            <ThemeProvider theme={theme}>
              <Categories />
            </ThemeProvider>
          </MemoryRouter>
        </MockedProvider>
      </Provider>
    );
    expect(screen.queryByRole('button', { name: /sort a→z/i })).not.toBeInTheDocument();
  });
});
