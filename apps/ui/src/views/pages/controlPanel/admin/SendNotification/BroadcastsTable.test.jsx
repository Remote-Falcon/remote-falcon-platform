import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import BroadcastsTable from './BroadcastsTable';
import { store } from '../../../../../store';
import { LIST_ADMIN_NOTIFICATIONS } from '../../../../../utils/graphql/controlPanel/queries';

// These tests cover the table's three observable states:
//   - empty (zero broadcasts ever sent)
//   - populated (rows render with their subjects)
//   - paginated (pager appears once total > pageSize)
// We do NOT exercise the edit/delete mutation paths here — those are
// brittle to mock at this layer and adding them buys little extra
// confidence over the validation tests in SendForm + the pager check
// below.

const theme = createTheme();

const renderTable = (mocks) =>
  render(
    <Provider store={store}>
      <MockedProvider mocks={mocks} addTypename={false}>
        <ThemeProvider theme={theme}>
          <BroadcastsTable />
        </ThemeProvider>
      </MockedProvider>
    </Provider>
  );

// Helper to build the LIST_ADMIN_NOTIFICATIONS mock for page 1.
const listMock = ({ items, total }) => ({
  request: {
    query: LIST_ADMIN_NOTIFICATIONS,
    variables: { offset: 0, limit: 10 }
  },
  result: {
    data: {
      listAdminNotifications: { items, total }
    }
  }
});

describe('BroadcastsTable', () => {
  it('renders the empty state when there are no broadcasts', async () => {
    renderTable([listMock({ items: [], total: 0 })]);

    // The query is in-flight initially; wait for the empty-state copy.
    await waitFor(() => {
      expect(screen.getByText(/no broadcasts yet/i)).toBeInTheDocument();
    });
  });

  it('renders one row per item returned by the query', async () => {
    const items = [
      { uuid: 'a', type: 'ADMIN', subject: 'Alpha', preview: 'Alpha preview', message: 'a', link: null, createdDate: '2026-05-01T00:00:00Z' },
      { uuid: 'b', type: 'ADMIN', subject: 'Bravo', preview: 'Bravo preview', message: 'b', link: null, createdDate: '2026-05-02T00:00:00Z' },
      { uuid: 'c', type: 'ADMIN', subject: 'Charlie', preview: 'Charlie preview', message: 'c', link: null, createdDate: '2026-05-03T00:00:00Z' }
    ];
    renderTable([listMock({ items, total: 3 })]);

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders the pager when total exceeds the page size', async () => {
    const items = Array.from({ length: 10 }).map((_, i) => ({
      uuid: `u${i}`,
      type: 'ADMIN',
      subject: `Subject ${i}`,
      preview: `Preview ${i}`,
      message: `Body ${i}`,
      link: null,
      createdDate: '2026-05-01T00:00:00Z'
    }));
    // total: 25 → 3 pages → pager should render.
    renderTable([listMock({ items, total: 25 })]);

    await waitFor(() => {
      expect(screen.getByText('Subject 0')).toBeInTheDocument();
    });

    // MUI's Pagination renders as a <nav> with role "navigation"; this is
    // a stable selector across MUI minor versions.
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
