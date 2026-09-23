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

describe('Categories — sort the name column and save it as the order', () => {
  beforeEach(() => {
    saveCategoriesService.mockClear();
    store.dispatch(setShow(null));
  });

  it('saves categories alphabetized with displayOrder renumbered, after confirming', async () => {
    const user = userEvent.setup();
    renderCategories();

    // Clicking the header previews the sort; only saving commits it.
    await user.click(screen.getByRole('button', { name: /category name/i }));
    await user.click(screen.getByRole('button', { name: /save as category order/i }));
    // Confirm dialog guards the overwrite of the dashboard-dragged order.
    await user.click(await screen.findByRole('button', { name: /^save order$/i }));

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
    await user.click(screen.getByRole('button', { name: /category name/i }));
    await user.click(screen.getByRole('button', { name: /save as category order/i }));
    expect(saveCategoriesService).not.toHaveBeenCalled();
  });

  it('previewing the sort alone never saves anything', async () => {
    // The whole point of preview-then-save: a click must not overwrite the
    // order the operator dragged into place.
    const user = userEvent.setup();
    renderCategories();
    await user.click(screen.getByRole('button', { name: /category name/i }));
    expect(screen.getByTestId('categories-sort-banner')).toBeInTheDocument();
    expect(saveCategoriesService).not.toHaveBeenCalled();
  });

  it('cancel sort drops the preview without saving', async () => {
    const user = userEvent.setup();
    renderCategories();
    await user.click(screen.getByRole('button', { name: /category name/i }));
    await user.click(screen.getByRole('button', { name: /cancel sort/i }));
    expect(screen.queryByTestId('categories-sort-banner')).not.toBeInTheDocument();
    expect(saveCategoriesService).not.toHaveBeenCalled();
  });

  it('sorts Z→A when the header is clicked twice', async () => {
    const user = userEvent.setup();
    renderCategories();
    await user.click(screen.getByRole('button', { name: /category name/i }));
    await user.click(screen.getByRole('button', { name: /category name/i }));
    await user.click(screen.getByRole('button', { name: /save as category order/i }));
    await user.click(await screen.findByRole('button', { name: /^save order$/i }));

    await waitFor(() => expect(saveCategoriesService).toHaveBeenCalledTimes(1));
    const [saved] = saveCategoriesService.mock.calls[0];
    expect(saved.map((c) => [c.name, c.displayOrder])).toEqual([
      ['Soundtrack', 0],
      ['Novelty', 1],
      ['Classic', 2]
    ]);
  });

  it('still offers the sort header with a single category', () => {
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
    expect(screen.getByRole('button', { name: /category name/i })).toBeInTheDocument();
  });
});
