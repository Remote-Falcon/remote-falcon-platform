import { Navigate, useRoutes } from 'react-router-dom';

import LoginRoutes from './LoginRoutes';
import MainRoutes from './MainRoutes';
import ViewerRoutes from './ViewerRoutes';

// Catch-all for unknown URLs. Sends the user to /404, which is a real
// route inside LoginRoutes that renders the v2 NotFound page.
const NotFoundRedirect = {
  path: '*',
  element: <Navigate to="/404" replace />
};

export default function ThemeRoutes() {
  return useRoutes([LoginRoutes, MainRoutes, ViewerRoutes, NotFoundRedirect]);
}
