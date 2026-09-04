import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { store } from '../../../../../store';
import { setShow } from '../../../../../store/slices/show';

// The save path is what these tests pin: the component must hand
// saveSequencesService the FULL list with `order` renumbered to match the
// preview. Mocking the service (rather than the Apollo mutation) keeps the
// assertion on the payload instead of on GraphQL variable plumbing.
const saveSequencesService = vi.fn((updated, _mutation, callback) =>
  callback({ success: true, toast: { message: 'Sequences Saved' } })
);

vi.mock('../../../../../services/controlPanel/mutations.service', () => ({
  saveSequencesService: (...args) => saveSequencesService(...args),
  saveSequenceGroupsService: vi.fn(),
  saveCategoriesService: vi.fn(),
  playSequenceFromControlPanelService: vi.fn(),
  forceNextSongService: vi.fn()
}));

// eslint-disable-next-line import/first
import SequencesList from '../SequencesList';

const theme = createTheme();

const sequence = (name, order, extra = {}) => ({
  name,
  displayName: name,
  index: order,
  order,
  active: true,
  visible: true,
  artist: null,
  category: null,
  group: null,
  imageUrl: null,
  type: 'SEQUENCE',
  ...extra
});

// Saved viewer-page order is deliberately NOT alphabetical, so an applied
// A→Z sort is visibly different from the starting state.
const baseShow = {
  showToken: 't',
  showName: 'Demo',
  sequences: [
    sequence('Carol of the Bells', 0),
    sequence('*Frozen Medley', 1),
    sequence('Amazing Grace', 2)
  ],
  sequenceGroups: [],
  categories: [],
  psaSequences: []
};

const renderList = (showOverrides = {}) => {
  store.dispatch(setShow({ ...baseShow, ...showOverrides }));
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

const sortByDisplayName = async (user) => {
  await user.click(screen.getByRole('button', { name: /display name/i }));
};

describe('SequencesList — save a column sort as the viewer page order', () => {
  beforeEach(() => {
    saveSequencesService.mockClear();
    store.dispatch(setShow(null));
  });

  it('shows the drag hint and no banner until a column is sorted', () => {
    renderList();
    expect(screen.getByText(/Drag rows to reorder/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as viewer page order/i })).not.toBeInTheDocument();
  });

  it('tells the owner the sort is a preview once a column is sorted', async () => {
    const user = userEvent.setup();
    renderList();
    await sortByDisplayName(user);
    expect(screen.getByText(/preview only/i)).toBeInTheDocument();
    expect(screen.getByText(/still uses your saved order/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save as viewer page order/i })).toBeEnabled();
  });

  it('saves every sequence with order renumbered to match the sort', async () => {
    const user = userEvent.setup();
    renderList();
    await sortByDisplayName(user);
    await user.click(screen.getByRole('button', { name: /save as viewer page order/i }));
    // Confirm dialog guards the overwrite of a hand-curated order.
    await user.click(await screen.findByRole('button', { name: /^save order$/i }));

    await waitFor(() => expect(saveSequencesService).toHaveBeenCalledTimes(1));
    const [saved] = saveSequencesService.mock.calls[0];
    expect(saved.map((s) => [s.displayName, s.order])).toEqual([
      ['*Frozen Medley', 0],
      ['Amazing Grace', 1],
      ['Carol of the Bells', 2]
    ]);
  });

  it('does not save until the confirm dialog is accepted', async () => {
    const user = userEvent.setup();
    renderList();
    await sortByDisplayName(user);
    await user.click(screen.getByRole('button', { name: /save as viewer page order/i }));
    expect(saveSequencesService).not.toHaveBeenCalled();
  });

  it('returns to the canonical (drag-enabled) view after saving', async () => {
    const user = userEvent.setup();
    renderList();
    await sortByDisplayName(user);
    await user.click(screen.getByRole('button', { name: /save as viewer page order/i }));
    await user.click(await screen.findByRole('button', { name: /^save order$/i }));

    await waitFor(() => expect(screen.getByText(/Drag rows to reorder/i)).toBeInTheDocument());
    expect(screen.queryByText(/preview only/i)).not.toBeInTheDocument();
  });

  it('disables the save while a search is masking rows — order is global', async () => {
    const user = userEvent.setup();
    renderList();
    await sortByDisplayName(user);
    await user.type(screen.getByPlaceholderText(/search/i), 'Amazing');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save as viewer page order/i })).toBeDisabled()
    );
  });

  it('"Cancel sort" drops the preview without saving anything', async () => {
    const user = userEvent.setup();
    renderList();
    await sortByDisplayName(user);
    await user.click(screen.getByRole('button', { name: /cancel sort/i }));
    expect(screen.getByText(/Drag rows to reorder/i)).toBeInTheDocument();
    expect(saveSequencesService).not.toHaveBeenCalled();
  });
});
