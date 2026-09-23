import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { store } from '../../../../../store';
import { setShow } from '../../../../../store/slices/show';
import Categories from '../Categories';

// The nightly play limit's blank / 0 / >0 rule is easy to get backwards, so
// the column header links to the docs section that explains it (#178). Pin
// the anchor: the docs site builds with onBrokenLinks, but nothing checks
// links pointing INTO it, so a renamed heading would 404 silently.
describe('Categories — nightly play limit docs link', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    store.dispatch(setShow(null));
  });

  it('opens the per-category nightly play limit docs section', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    store.dispatch(
      setShow({
        showToken: 't',
        showName: 'Demo',
        sequences: [],
        sequenceGroups: [],
        categories: [{ name: 'Rock', displayOrder: 0, requestLimit: 0, antiConsecutive: false }],
        psaSequences: []
      })
    );
    render(
      <Provider store={store}>
        <MockedProvider mocks={[]} addTypename={false}>
          <MemoryRouter>
            <ThemeProvider theme={createTheme()}>
              <Categories />
            </ThemeProvider>
          </MemoryRouter>
        </MockedProvider>
      </Provider>
    );

    await userEvent.setup().click(screen.getByTestId('categories-nightly-limit-docs'));

    expect(open).toHaveBeenCalledWith(
      'https://docs.remotefalcon.com/docs/docs/control-panel/show/sequences#nightly-play-limit',
      '_blank',
      'noreferrer'
    );
  });
});
