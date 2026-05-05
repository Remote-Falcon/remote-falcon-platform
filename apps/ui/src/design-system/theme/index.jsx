/**
 * v2 ThemeProvider — drop-in replacement for `themes/index.jsx`.
 *
 * Wires the new tokens into MUI. To switch the app over, change the
 * import in `App.jsx` (or wherever `ThemeCustomization` is used):
 *
 *   - import ThemeCustomization from './themes';
 *   + import ThemeCustomization from './design-system/theme';
 *
 * Until then, both systems coexist and you can flip between them via
 * the env var `VITE_USE_DESIGN_SYSTEM_V2=true`. See MIGRATION.md.
 */

import { useMemo } from 'react';

import { CssBaseline, StyledEngineProvider } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import PropTypes from 'prop-types';

import { shadowsFor } from '../tokens/shadows';
import breakpoints from '../tokens/breakpoints';
import { duration, easing } from '../tokens/motion';

import buildPalette from './palette';
import buildTypography from './typography';
import buildComponentOverrides from './componentOverrides';

import useConfig from '../../hooks/useConfig';

export default function ThemeCustomization({ children }) {
  const { navType = 'dark' } = useConfig() || {};

  const theme = useMemo(() => {
    const palette = buildPalette(navType);
    const typography = buildTypography();
    const sh = shadowsFor(navType);

    const base = createTheme({
      palette,
      typography,
      breakpoints: { values: breakpoints },
      shape: { borderRadius: 12 },
      transitions: {
        duration: {
          shortest: duration.fast,
          shorter:  duration.fast,
          short:    duration.fast,
          standard: duration.base,
          complex:  duration.slow,
          enteringScreen: duration.base,
          leavingScreen:  duration.fast
        },
        easing: {
          easeInOut: easing.standard,
          easeOut:   easing.enter,
          easeIn:    easing.exit,
          sharp:     easing.standard
        }
      },
      // Custom — components access via `theme.customShadows.*` (mirrors legacy API).
      customShadows: {
        subtle:   sh.subtle,
        medium:   sh.medium,
        elevated: sh.elevated,
        glow:     sh.glow
      }
    });

    base.components = buildComponentOverrides(base);
    return base;
  }, [navType]);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

ThemeCustomization.propTypes = {
  children: PropTypes.node
};
