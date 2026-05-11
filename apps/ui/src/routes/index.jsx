import { Navigate, useRoutes } from 'react-router-dom';

import LoginRoutes from './LoginRoutes';
import MainRoutes from './MainRoutes';
import ViewerRoutes from './ViewerRoutes';
import WrappedRoutes from './WrappedRoutes';

// Catch-all for unknown URLs. Sends the user to /404, which is a real
// route inside LoginRoutes that renders the v2 NotFound page.
const NotFoundRedirect = {
  path: '*',
  element: <Navigate to="/404" replace />
};

export default function ThemeRoutes() {
  return useRoutes([WrappedRoutes, LoginRoutes, MainRoutes, ViewerRoutes, NotFoundRedirect]);
}
