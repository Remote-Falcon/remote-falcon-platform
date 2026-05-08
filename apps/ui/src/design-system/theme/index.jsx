/**
 * v2 ThemeProvider — wires the design-system tokens into MUI.
 *
 * Imported directly by App.jsx as the only ThemeCustomization. The
 * legacy Berry theme under `apps/ui/src/themes/` is kept for now
 * because some control-panel views still reference its custom
 * typography keys; once those phases ship, that directory can be
 * deleted (see MIGRATION.md, Phase 10).
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
