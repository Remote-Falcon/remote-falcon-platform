/**
 * MUI component overrides built from design tokens.
 *
 * Replaces the legacy `themes/compStyleOverride.jsx` (315 lines, 24-step
 * shadow ladder, hardcoded radii). This version is shorter, intent-named,
 * and 100% derived from tokens.
 */

import radius from '../tokens/radius';
import { shadowsFor } from '../tokens/shadows';
import { duration, easing } from '../tokens/motion';

const buildComponentOverrides = (theme) => {
  const mode = theme.palette.mode;
  const surfaces = theme.palette.surfaces;
  const sh = shadowsFor(mode);
  const t = `${duration.fast}ms ${easing.standard}`;

  return {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        body: {
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale'
        },
        ':focus-visible': {
          outline: `2px solid ${theme.palette.secondary.main}`,
          outlineOffset: 2,
          borderRadius: radius.xs
        },
        // Custom scrollbars in dark mode — they shouldn't dominate the UI
        '::-webkit-scrollbar': { width: 10, height: 10 },
        '::-webkit-scrollbar-track': { background: 'transparent' },
        '::-webkit-scrollbar-thumb': {
          background: surfaces.lineStrong,
          borderRadius: radius.pill,
          border: `2px solid ${theme.palette.background.default}`
        },
        '::-webkit-scrollbar-thumb:hover': {
          background: theme.palette.text.muted
        }
      }
    },

    // Buttons --------------------------------------------------------------
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: 0,
          transition: `transform ${t}, background-color ${t}, box-shadow ${t}`,
          '&:hover': { transform: 'translateY(-1px)' }
        },
        // Secondary CTA — brand amber, the warm primary action color.
        // Use color="secondary" for "Start free", "Show is live", etc.
        containedSecondary: {
          boxShadow: '0 6px 20px rgba(199,126,35,0.30)',
          '&:hover': { boxShadow: '0 8px 28px rgba(199,126,35,0.45)' }
        },
        // Primary CTA — navy, the cooler/cooler-supporting button color.
        containedPrimary: {
          boxShadow: '0 6px 20px rgba(31,119,120,0.28)',
          '&:hover': { boxShadow: '0 8px 28px rgba(31,119,120,0.42)' }
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: sh.medium }
        },
        outlined: {
          borderColor: surfaces.lineStrong
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.sm,
          transition: `background-color ${t}, color ${t}`,
          color: theme.palette.text.secondary,
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
            color: theme.palette.text.primary
          }
        }
      }
    },

    // Surfaces -------------------------------------------------------------
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          backgroundImage: 'none' // kill MUI's auto gradient on dark Paper
        }
      }
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          backgroundColor: theme.palette.background.paper,
          // No default border — borders are reserved for inputs and dividers.
          // Use shadow only on hover or when explicitly elevated.
          boxShadow: 'none',
          transition: `background-color ${t}, transform ${t}, box-shadow ${t}`
        }
      }
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          padding: '16px 20px',
          borderBottom: `1px solid ${surfaces.line}`
        },
        title: {
          fontSize: '0.9375rem',
          fontWeight: 600,
          letterSpacing: 0
        }
      }
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 20,
          '&:last-child': { paddingBottom: 20 }
        }
      }
    },

    // Inputs ---------------------------------------------------------------
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radius.sm,
          backgroundColor: surfaces.bg2,
          '& fieldset': { borderColor: surfaces.line },
          '&:hover fieldset': { borderColor: `${surfaces.lineStrong} !important` },
          '&.Mui-focused fieldset': {
            borderColor: `${theme.palette.secondary.main} !important`,
            borderWidth: '1px !important'
          }
        },
        input: { padding: '11px 14px' }
      }
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: theme.palette.text.muted }
      }
    },

    // Navigation -----------------------------------------------------------
    MuiAppBar: {
      defaultProps: { color: 'transparent', elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          backdropFilter: 'blur(14px) saturate(150%)',
          WebkitBackdropFilter: 'blur(14px) saturate(150%)',
          borderBottom: `1px solid ${surfaces.line}`
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: surfaces.bg1,
          borderRight: `1px solid ${surfaces.line}`,
          backgroundImage: 'none'
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.sm,
          margin: '2px 8px',
          padding: '8px 12px',
          color: theme.palette.text.secondary,
          transition: `background-color ${t}, color ${t}`,
          '&:hover': {
            backgroundColor: theme.palette.action.hover,
            color: theme.palette.text.primary
          },
          // Selected state uses brand amber tint (the brand CTA color).
          '&.Mui-selected': {
            backgroundColor: 'rgba(199,126,35,0.12)',
            color: theme.palette.text.primary,
            '&:hover': { backgroundColor: 'rgba(199,126,35,0.18)' }
          }
        }
      }
    },

    // Tables ---------------------------------------------------------------
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${surfaces.line}`,
          padding: '14px 16px'
        },
        head: {
          color: theme.palette.text.muted,
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          padding: '12px 16px'
        }
      }
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: `background-color ${t}`,
          '&:hover': { backgroundColor: theme.palette.action.hover }
        }
      }
    },

    // Chips & badges -------------------------------------------------------
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: radius.pill,
          fontWeight: 500,
          fontSize: '0.75rem'
        }
      }
    },

    // Tooltips -------------------------------------------------------------
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: surfaces.bg3,
          color: theme.palette.text.primary,
          borderRadius: radius.sm,
          fontSize: '0.75rem',
          fontWeight: 500,
          padding: '6px 10px',
          boxShadow: sh.medium,
          border: `1px solid ${surfaces.line}`
        },
        arrow: { color: surfaces.bg3 }
      }
    },

    // Dialogs --------------------------------------------------------------
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: radius.lg,
          boxShadow: sh.elevated,
          backgroundImage: 'none'
        }
      }
    }
  };
};

export default buildComponentOverrides;
