import React, { lazy } from 'react';

import V2Theme from '../design-system/theme';
import Loadable from '../ui-component/Loadable';

const MapPage = Loadable(lazy(() => import('../views/pages/map')));

// Truly public route — no AuthGuard, no GuestGuard (same pattern as
// WrappedRoutes). The public shows map is top-of-funnel discovery: visitors
// arrive from social shares and local news without an account. Registering
// it as its own top-level group (before LoginRoutes) keeps it reachable on
// the apex domain regardless of the swapCP subdomain logic in GuestGuard.
// Only shows that opted into PUBLIC visibility (preferences.showOnMapPublic)
// appear, with coordinates rounded server-side. Members-only opt-ins
// (preferences.showOnMap) are visible solely on the dashboard Shows Map.
const MapRoutes = {
  path: '/map',
  element: (
    <V2Theme>
      <MapPage />
    </V2Theme>
  )
};

export default MapRoutes;
