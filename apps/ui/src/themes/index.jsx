import { useMemo } from 'react';

import { CssBaseline, StyledEngineProvider } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import PropTypes from 'prop-types';

import useConfig from '../hooks/useConfig';

import componentStyleOverrides from './compStyleOverride';
import Palette from './palette';
import customShadows from './shadows';
import Typography from './typography';

export default function ThemeCustomization({ children }) {
  const { borderRadius, fontFamily, navType, outlinedFilled, presetColor, rtlLayout } = useConfig();

  const theme = useMemo(() => Palette(navType, presetColor), [navType, presetColor]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const themeTypography = useMemo(() => Typography(theme, borderRadius, fontFamily), [theme, borderRadius, fontFamily]);
  const themeCustomShadows = useMemo(() => customShadows(navType, theme), [navType, theme]);

  const themeOptions = useMemo(
    () => ({
      direction: rtlLayout ? 'rtl' : 'ltr',
      palette: theme.palette,
      // v2 dashboard topbar (56px) per the mockup. The Toolbar mixin sets
      // both the default minHeight and the horizontal padding for any
      // `<Toolbar>` in the app — control panel + auth chrome both pick
      // this up. The 16px vertical padding the Berry default applied is
      // dropped because it pushed our 40-48px chip + button rows past
      // 80px of total bar height.
      mixins: {
        toolbar: {
          minHeight: '56px',
          paddingLeft: '16px',
          paddingRight: '16px',
          '@media (min-width: 600px)': {
            minHeight: '56px',
            paddingLeft: '24px',
            paddingRight: '24px'
          }
        }
      },
      typography: themeTypography,
      customShadows: themeCustomShadows
    }),
    [rtlLayout, theme, themeCustomShadows, themeTypography]
  );

  const themes = createTheme(themeOptions);
  themes.components = useMemo(() => componentStyleOverrides(themes, borderRadius, outlinedFilled), [themes, borderRadius, outlinedFilled]);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={themes}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

ThemeCustomization.propTypes = {
  children: PropTypes.node
};
