import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import MapPage from '../index';
import { SHOWS_ON_MAP } from '../../../../utils/graphql/controlPanel/queries';

// Public /map page: envelope response (totalShows + shows) and the
// community-size header line. The public query returns ONLY public
// opt-ins; totalShows gives visitors the real community size even
// when few shows share publicly.

vi.mock('../../../../ui-component/maps/ShowsMapLibre', () => ({
  default: ({ shows }) => <div data-testid="mock-map">{shows?.length} pins</div>
}));

vi.mock('../../../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

const theme = createTheme();

const publicQueryMock = {
  request: { query: SHOWS_ON_MAP },
  result: {
    data: {
      showsOnAMap: {
        totalShows: 2606,
        shows: [{ showName: 'Public Show', showSubdomain: 'public-show', showLatitude: 36.2, showLongitude: -81.2, publiclyVisible: true }]
      }
    }
  }
};

const renderMapPage = (mocks = [publicQueryMock]) =>
  render(
    <MockedProvider mocks={mocks} addTypename={false}>
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <MapPage />
        </ThemeProvider>
      </MemoryRouter>
    </MockedProvider>
  );

describe('Public map — community stats header', () => {
  it('renders the community-size line with public share count', async () => {
    renderMapPage();
    await waitFor(() => {
      expect(screen.getByText('2,606 shows run on Remote Falcon · 1 shared publicly below')).toBeInTheDocument();
    });
    expect(screen.getByTestId('mock-map')).toHaveTextContent('1 pins');
  });

  it('falls back to a plain count when totalShows is absent', async () => {
    const noTotalMock = {
      request: { query: SHOWS_ON_MAP },
      result: { data: { showsOnAMap: { totalShows: null, shows: [] } } }
    };
    renderMapPage([noTotalMock]);
    await waitFor(() => {
      expect(screen.getByText('0 shows')).toBeInTheDocument();
    });
  });

  it('keeps the Return to Homepage link routed to /', async () => {
    renderMapPage();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /return to homepage/i })).toHaveAttribute('href', '/');
    });
  });
});
