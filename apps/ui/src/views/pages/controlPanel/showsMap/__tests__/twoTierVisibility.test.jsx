import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import ShowsMap from '../index';
import { store } from '../../../../../store';
import { setShow } from '../../../../../store/slices/show';
import { SHOWS_ON_MAP_FOR_USERS } from '../../../../../utils/graphql/controlPanel/queries';
import { savePreferencesService } from '../../../../../services/controlPanel/mutations.service';
import { trackPosthogEvent } from '../../../../../utils/analytics/posthog';

// Public Show Map two-tier visibility. Pins the two-toggle consent model:
// showOnMap (members-only community map) and showOnMapPublic (the
// unauthenticated public /map page) are INDEPENDENT preferences — flipping
// the public toggle must never silently rewrite the members one, and
// members-only opt-ins must never be upgraded to public.

// MapLibre GL needs a real canvas/WebGL context; jsdom has neither.
vi.mock('../../../../../ui-component/maps/ShowsMapLibre', () => ({
  default: ({ shows }) => <div data-testid="mock-map">{shows?.length} pins</div>
}));

vi.mock('../../../../../services/controlPanel/mutations.service', () => ({
  savePreferencesService: vi.fn()
}));

vi.mock('../../../../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

const theme = createTheme();

const seededShow = {
  showToken: 't',
  showName: 'Test Show',
  preferences: {
    showOnMap: true,
    showOnMapPublic: false,
    showLatitude: 35.0,
    showLongitude: -80.0,
    blockedViewerIps: []
  }
};

const membersQueryMock = {
  request: { query: SHOWS_ON_MAP_FOR_USERS },
  result: {
    data: {
      showsOnAMapForUsers: {
        totalShows: 2606,
        shows: [
          { showName: 'Members Only', showSubdomain: 'members-only', showLatitude: 35.1, showLongitude: -80.1, publiclyVisible: false },
          { showName: 'Public Show', showSubdomain: 'public-show', showLatitude: 36.2, showLongitude: -81.2, publiclyVisible: true }
        ]
      }
    }
  }
};

const renderShowsMap = () =>
  render(
    <Provider store={store}>
      <MockedProvider mocks={[membersQueryMock, membersQueryMock]} addTypename={false}>
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <ShowsMap />
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>
    </Provider>
  );

describe('Shows Map — two-tier visibility toggles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.dispatch(setShow(seededShow));
  });

  it('renders both toggles seeded from preferences', async () => {
    const { container } = renderShowsMap();
    await waitFor(() => expect(container.querySelector('input[name="displayShowOnMap"]')).toBeInTheDocument());
    const membersToggle = container.querySelector('input[name="displayShowOnMap"]');
    const publicToggle = container.querySelector('input[name="displayShowOnMapPublic"]');
    expect(membersToggle).toBeChecked();
    expect(publicToggle).not.toBeChecked();
  });

  // A screen-reader user must be able to tell "show to RF users" from "show to
  // the entire internet" — the public one discloses a home location.
  it('gives both toggles distinct accessible names', async () => {
    renderShowsMap();
    const membersToggle = await screen.findByRole('checkbox', {
      name: /to logged-in Remote Falcon users/i
    });
    const publicToggle = screen.getByRole('checkbox', { name: /on the public map, visible to anyone/i });
    expect(membersToggle).toHaveAttribute('name', 'displayShowOnMap');
    expect(publicToggle).toHaveAttribute('name', 'displayShowOnMapPublic');
  });

  it('flipping the public toggle saves showOnMapPublic without touching showOnMap, and emits the activation event', async () => {
    const { container } = renderShowsMap();
    await waitFor(() => expect(container.querySelector('input[name="displayShowOnMapPublic"]')).toBeInTheDocument());
    const publicToggle = container.querySelector('input[name="displayShowOnMapPublic"]');
    await userEvent.click(publicToggle);

    expect(savePreferencesService).toHaveBeenCalledTimes(1);
    const savedPreferences = savePreferencesService.mock.calls[0][0];
    expect(savedPreferences.showOnMapPublic).toBe(true);
    expect(savedPreferences.showOnMap).toBe(true);
    expect(trackPosthogEvent).toHaveBeenCalledWith('map_visibility_toggled', {
      field: 'showOnMapPublic',
      enabled: true
    });
  });

  it('flipping the members toggle saves showOnMap without touching showOnMapPublic', async () => {
    const { container } = renderShowsMap();
    await waitFor(() => expect(container.querySelector('input[name="displayShowOnMap"]')).toBeInTheDocument());
    const membersToggle = container.querySelector('input[name="displayShowOnMap"]');
    await userEvent.click(membersToggle);

    expect(savePreferencesService).toHaveBeenCalledTimes(1);
    const savedPreferences = savePreferencesService.mock.calls[0][0];
    expect(savedPreferences.showOnMap).toBe(false);
    expect(savedPreferences.showOnMapPublic).toBe(false);
  });

  it('shows the community-size stat line from the members query envelope', async () => {
    renderShowsMap();
    await waitFor(() => {
      expect(screen.getByText('2,606 shows on Remote Falcon, 2 on the community map')).toBeInTheDocument();
    });
  });
});
