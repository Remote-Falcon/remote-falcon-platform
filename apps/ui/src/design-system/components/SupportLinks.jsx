import { useRef, useState } from 'react';
import * as React from 'react';

import {
  Box,
  ClickAwayListener,
  Divider,
  IconButton,
  Link,
  Paper,
  Popper,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  IconBrandPatreon,
  IconCoffee,
  IconCup,
  IconHeart
} from '@tabler/icons-react';
import PropTypes from 'prop-types';

// "Support the project" mini-section for the sidebar footer. Three branded
// outbound links — Patreon, Ko-fi, Buy Me a Coffee — kept persistently in
// view because (a) it's a one-person project and (b) the sidebar bottom
// would otherwise sit empty above the theme toggle.
//
// Two render modes:
//   variant="expanded" — labeled section + 3 brand-tinted icon buttons in a row.
//   variant="collapsed" — single heart icon button that pops out the same 3
//                         links to the right (used when the rail is collapsed).
//
// Each button uses a low-alpha background in its brand color so the row reads
// as a coordinated set rather than three random hues.

// `color` drives the brand-tinted background + border (recognizable as
// the brand). `textColorLight` (optional) overrides the icon foreground
// in light mode when the brand color is too pale to read on white —
// e.g. BMAC's #FFDD00 is invisible at any reasonable foreground use,
// so we render the icon in a darker amber while keeping the brand
// yellow visible behind it. Dark mode always uses the raw brand color.
const LINKS = [
  {
    key: 'patreon',
    label: 'Patreon',
    href: 'https://www.patreon.com/cw/MattShorts',
    color: '#FF424D',
    Icon: IconBrandPatreon
  },
  {
    key: 'kofi',
    label: 'Ko-fi',
    href: 'https://ko-fi.com/mattshorts',
    color: '#29ABE0',
    Icon: IconCup
  },
  {
    key: 'bmac',
    label: 'Buy Me a Coffee',
    href: 'https://buymeacoffee.com/mattshorts',
    color: '#FFDD00',
    textColorLight: '#A07A00',
    Icon: IconCoffee
  }
];

// Full-width variant fills its parent (used in the row layout where 3
// buttons each take ~1/3 of the rail width). Fixed-width variant uses a
// 36px square — kept available for non-row contexts.
const BrandLinkButton = ({ link, fullWidth = false }) => {
  const theme = useTheme();
  const { label, href, color, textColorLight, Icon } = link;
  const iconColor = theme.palette.mode === 'dark' ? color : textColorLight || color;
  return (
    <Tooltip title={`Support on ${label}`} placement="top">
      <IconButton
        component={Link}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Support on ${label}`}
        sx={{
          width: fullWidth ? '100%' : 36,
          height: 34,
          borderRadius: 1.25,
          color: iconColor,
          bgcolor: alpha(color, 0.10),
          border: '1px solid',
          borderColor: alpha(color, 0.22),
          transition: 'background-color 120ms ease, transform 120ms ease',
          '&:hover': {
            bgcolor: alpha(color, 0.18),
            transform: 'translateY(-1px)'
          }
        }}
      >
        <Icon size={18} stroke={1.75} />
      </IconButton>
    </Tooltip>
  );
};

BrandLinkButton.propTypes = {
  link: PropTypes.shape({
    label: PropTypes.string,
    href: PropTypes.string,
    color: PropTypes.string,
    Icon: PropTypes.elementType
  }).isRequired,
  fullWidth: PropTypes.bool
};

const SupportLinks = ({ variant = 'expanded' }) => {
  const theme = useTheme();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const iconColor = (link) => (theme.palette.mode === 'dark' ? link.color : link.textColorLight || link.color);

  if (variant === 'collapsed') {
    return (
      <>
        <Tooltip title="Support the project" placement="right">
          <IconButton
            ref={anchorRef}
            onClick={() => setOpen((v) => !v)}
            aria-label="Support the project"
            sx={{
              width: 36,
              height: 36,
              mx: 'auto',
              mb: 0.5,
              display: 'flex',
              color: 'error.main',
              '&:hover': { bgcolor: (t) => alpha(t.palette.error.main, 0.10) }
            }}
          >
            <IconHeart size={18} stroke={1.75} />
          </IconButton>
        </Tooltip>
        <Popper
          open={open}
          anchorEl={anchorRef.current}
          placement="right-end"
          modifiers={[{ name: 'offset', options: { offset: [0, 12] } }]}
          sx={{ zIndex: (t) => t.zIndex.drawer + 2 }}
        >
          <ClickAwayListener onClickAway={() => setOpen(false)}>
            <Paper
              elevation={6}
              sx={{
                p: 1.25,
                minWidth: 180,
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              <Typography
                variant="overline"
                sx={{
                  display: 'block',
                  px: 1,
                  pb: 0.5,
                  color: 'text.secondary',
                  letterSpacing: '0.06em',
                  fontWeight: 600
                }}
              >
                Support the project
              </Typography>
              <Stack spacing={0.5}>
                {LINKS.map((link) => (
                  <Link
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="none"
                    onClick={() => setOpen(false)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      px: 1,
                      py: 0.75,
                      borderRadius: 1,
                      color: 'text.primary',
                      fontSize: 13,
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                  >
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: 0.75,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: iconColor(link),
                        bgcolor: alpha(link.color, 0.12),
                        border: '1px solid',
                        borderColor: alpha(link.color, 0.22)
                      }}
                    >
                      <link.Icon size={14} stroke={1.75} />
                    </Box>
                    {link.label}
                  </Link>
                ))}
              </Stack>
            </Paper>
          </ClickAwayListener>
        </Popper>
      </>
    );
  }

  // "Support" label centered on top of a horizontal divider — flex line +
  // label + flex line trick so the label looks like it cuts through the
  // rule. Three brand buttons below stretch evenly to fill the rail width.
  return (
    <Box sx={{ px: 0.5, pb: 0.25 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Divider sx={{ flex: 1 }} />
        <Typography
          component="span"
          sx={{
            color: 'text.disabled',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            lineHeight: 1,
            px: 0.5
          }}
        >
          Support
        </Typography>
        <Divider sx={{ flex: 1 }} />
      </Stack>
      <Stack direction="row" spacing={0.75}>
        {LINKS.map((link) => (
          <Box key={link.key} sx={{ flex: 1, minWidth: 0 }}>
            <BrandLinkButton link={link} fullWidth />
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

SupportLinks.propTypes = {
  variant: PropTypes.oneOf(['expanded', 'collapsed'])
};

export default SupportLinks;
