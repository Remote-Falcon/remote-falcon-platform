/**
 * Design tokens — single import point.
 *
 *   import tokens from 'design-system/tokens';
 *   tokens.colors.brand[500]
 *   tokens.radius.md
 *   tokens.shadowsFor('dark').elevated
 */

import colors, { brand, accent, cyan, pink, dark, light, semantic, neutralsFor } from './colors';
import radius from './radius';
import shadows, { shadowsFor } from './shadows';
import typography, { fontFamily, fontWeight, roles } from './typography';
import motion, { duration, easing, transition } from './motion';
import spacingTokens, { spacing, density, baseUnit } from './spacing';
import breakpoints from './breakpoints';

export {
  colors, brand, accent, cyan, pink, dark, light, semantic, neutralsFor,
  radius,
  shadows, shadowsFor,
  typography, fontFamily, fontWeight, roles,
  motion, duration, easing, transition,
  spacingTokens, spacing, density, baseUnit,
  breakpoints
};

const tokens = {
  colors,
  radius,
  shadows,
  typography,
  motion,
  spacing: spacingTokens,
  breakpoints
};

export default tokens;
