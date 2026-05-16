import React, { lazy } from 'react';

import V2Theme from '../design-system/theme';
import Loadable from '../ui-component/Loadable';

const WrappedPage = Loadable(lazy(() => import('../views/pages/wrapped')));

// Truly public route — no AuthGuard, no GuestGuard. Anyone with the URL
// can view a show's End-of-Season Wrapped page. The whole point is
// shareability ("post your Wrapped to your Facebook group"), but the
// path uses a CSPRNG-random capability token, NOT the show subdomain,
// so URLs aren't guessable from the publicly-enumerable subdomain space.
//
// URL shape: /wrapped/:token/:season-:year, e.g.
//   /wrapped/g7h3K9pQ2vL8mX4nR1tY6wZ0jB5sC8eF/christmas-2026
const WrappedRoutes = {
  path: '/wrapped/:token/:seasonAndYear',
  element: (
    <V2Theme>
      <WrappedPage />
    </V2Theme>
  )
};

export default WrappedRoutes;
