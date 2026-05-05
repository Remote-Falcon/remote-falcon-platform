/**
 * MUI typography built from design tokens.
 */

import { fontFamily, fontWeight, roles } from '../tokens/typography';

const toMui = (role) => ({
  fontSize:      role.size,
  fontWeight:    role.weight,
  lineHeight:    role.lineHeight,
  letterSpacing: role.tracking
});

const buildTypography = () => ({
  fontFamily: fontFamily.sans,

  // Default body
  fontSize: 15,
  htmlFontSize: 16,

  // Headings
  h1: toMui(roles.h1),
  h2: toMui(roles.h2),
  h3: toMui(roles.h3),
  h4: toMui(roles.h4),
  h5: toMui({ ...roles.h4, size: '0.9375rem' }),
  h6: toMui({ ...roles.h4, size: '0.875rem',  weight: 600 }),

  // Body
  body1:    toMui(roles.body),
  body2:    toMui(roles.bodySm),
  subtitle1: { ...toMui(roles.body),   fontWeight: fontWeight.medium },
  subtitle2: { ...toMui(roles.bodySm), fontWeight: fontWeight.medium },

  // Utility
  caption: toMui(roles.caption),
  overline: { ...toMui(roles.label), textTransform: 'uppercase' },
  button: {
    fontFamily: fontFamily.sans,
    fontWeight: fontWeight.semibold,
    fontSize:   '0.875rem',
    lineHeight: 1.4,
    textTransform: 'none', // never SHOUTING CAPS — keep cases natural
    letterSpacing: 0
  },

  // Custom: a "display" role for hero copy. Not a standard MUI role —
  // reach for it via `<Typography variant="display">`.
  display: toMui(roles.display)
});

export default buildTypography;
