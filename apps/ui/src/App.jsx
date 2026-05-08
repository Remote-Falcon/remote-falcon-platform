import React from 'react';

import { JWTProvider as AuthProvider } from './contexts/JWTContext';
import NavigationScroll from './layout/NavigationScroll';
import Routes from './routes';
import LegacyTheme from './themes';
import V2Theme from './design-system/theme';
import Snackbar from './ui-component/extended/Snackbar';
import Locales from './ui-component/Locales';
import RTLLayout from './ui-component/RTLLayout';

// Resolved at module load. Flip via VITE_USE_DESIGN_SYSTEM_V2=true and rebuild.
const ThemeCustomization =
  import.meta.env.VITE_USE_DESIGN_SYSTEM_V2 === 'true' ? V2Theme : LegacyTheme;

const App = () => (
  <ThemeCustomization>
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
  </ThemeCustomization>
);

export default App;
