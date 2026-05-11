import React, { lazy } from 'react';

import V2Theme from '../design-system/theme';
import Loadable from '../ui-component/Loadable';

const WrappedPage = Loadable(lazy(() => import('../views/pages/wrapped')));

// Truly public route — no AuthGuard, no GuestGuard. Anyone with the URL
// can view a show's End-of-Season Wrapped page. The whole point is
// shareability ("post your Wrapped to your Facebook group").
//
// URL shape: /wrapped/:showSubdomain/:season-:year, e.g.
//   /wrapped/winterlights2026/christmas-2026
//   /wrapped/spookystreet/halloween-2026
const WrappedRoutes = {
  path: '/wrapped/:showSubdomain/:seasonAndYear',
  element: (
    <V2Theme>
      <WrappedPage />
    </V2Theme>
  )
};

export default WrappedRoutes;
