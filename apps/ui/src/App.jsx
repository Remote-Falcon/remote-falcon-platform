import React from 'react';

import { JWTProvider as AuthProvider } from './contexts/JWTContext';
import NavigationScroll from './layout/NavigationScroll';
import Routes from './routes';
import LegacyTheme from './themes';
import Snackbar from './ui-component/extended/Snackbar';
import Locales from './ui-component/Locales';
import RTLLayout from './ui-component/RTLLayout';

// Theme strategy during the modernization:
//   - LegacyTheme (Berry) is the global default at this level — it covers
//     the control panel and any other surface that hasn't been migrated yet.
//   - The v2 design system wraps individual route groups that have been
//     refreshed (currently LoginRoutes — landing, auth, legal, 404). See
//     apps/ui/src/routes/LoginRoutes.jsx.
// When MainRoutes (control-panel) finishes migrating per Phases 3–9 of
// MIGRATION.md, swap this import to design-system/theme and drop the
// per-route override.
const App = () => (
  <LegacyTheme>
    {/* RTL layout */}
    <RTLLayout>
      <Locales>
        <NavigationScroll>
          <AuthProvider>
            <>
              <Routes />
              <Snackbar />
            </>
          </AuthProvider>
        </NavigationScroll>
      </Locales>
    </RTLLayout>
  </LegacyTheme>
);

export default App;
