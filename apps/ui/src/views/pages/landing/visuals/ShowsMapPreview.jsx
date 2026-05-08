/**
 * <ShowsMapPreview />
 *
 * Decorative preview for the "Find & be found on the Shows Map" feature.
 * Stylized map view with show pins (clusters and singles), one active
 * show with a floating popup card, plus a small search bar at top and
 * a "shows mapped" stat at the bottom. Pure JSX — no real map tiles.
 */

import { Box, Stack, Typography } from '@mui/material';
import { alpha, keyframes, useTheme } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { IconMapPinFilled, IconSearch } from '@tabler/icons-react';

const ping = keyframes`
  0%   { transform: scale(0.6); opacity: 0.6; }
  80%  { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
`;

// ---------- Map background ------------------------------------------------
// Inspired by MapTiler's `streets-v2-dark` style (the production map in the
// Public-Map PRD). Layered SVG: dark land base → faint building blocks for
// neighborhood texture → minor street network → major arterials → water bay
// → amber interstate. Strictly navy + amber tones; green is reserved for
// the live-pin status colour so the backdrop stays brand-coherent.

const MapBackdrop = () => {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;
  const highway = theme.palette.secondary.main;

  const land        = dark ? '#0d1218' : '#eef1f6';
  const buildings   = dark ? alpha(primary, 0.10) : alpha(primary, 0.07);
  const streetMinor = dark ? alpha(primary, 0.16) : alpha(primary, 0.22);
  const streetMaj   = dark ? alpha(primary, 0.34) : alpha(primary, 0.46);
  const water       = dark ? alpha(primary, 0.42) : alpha(primary, 0.32);

  return (
    <Box
      component="svg"
      viewBox="0 0 200 150"
      preserveAspectRatio="none"
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block'
      }}
    >
      {/* 1. Land base */}
      <rect width="200" height="150" fill={land} />

      {/* 2. Water — bay tucked into bottom-right, plus a winding river */}
      <path
        d="M 200,150 L 124,150 Q 116,128 138,116 Q 162,102 184,86 L 200,76 Z"
        fill={water}
      />
      <path
        d="M -2,118 Q 32,108 56,116 Q 80,124 108,118 Q 132,112 152,116"
        fill="none"
        stroke={water}
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* 3. Building footprints — three clustered "neighborhoods" so the
            map reads as inhabited geography, not abstract graphics */}
      <g fill={buildings}>
        {/* Downtown cluster (top-left) */}
        <rect x="14" y="22" width="6" height="4" rx="0.5" />
        <rect x="22" y="22" width="4" height="5" rx="0.5" />
        <rect x="14" y="29" width="3" height="3" rx="0.5" />
        <rect x="19" y="29" width="7" height="3" rx="0.5" />
        <rect x="14" y="34" width="5" height="4" rx="0.5" />
        <rect x="21" y="34" width="5" height="6" rx="0.5" />
        {/* Mid-town cluster (centre-left, near highway) */}
        <rect x="46" y="58" width="4" height="3" rx="0.5" />
        <rect x="52" y="58" width="3" height="5" rx="0.5" />
        <rect x="46" y="63" width="6" height="3" rx="0.5" />
        <rect x="54" y="65" width="4" height="3" rx="0.5" />
        <rect x="46" y="68" width="3" height="3" rx="0.5" />
        {/* Suburb cluster (right side) */}
        <rect x="148" y="40" width="3" height="3" rx="0.5" />
        <rect x="153" y="38" width="4" height="4" rx="0.5" />
        <rect x="159" y="40" width="3" height="3" rx="0.5" />
        <rect x="151" y="46" width="3" height="3" rx="0.5" />
        <rect x="156" y="46" width="5" height="3" rx="0.5" />
      </g>

      {/* 4. Minor street network — many organic, gently curving paths */}
      <g fill="none" stroke={streetMinor} strokeWidth="0.5" strokeLinecap="round">
        <path d="M -2,32 Q 40,28 80,34 Q 120,40 200,34" />
        <path d="M -2,46 Q 50,42 100,48 Q 150,54 200,50" />
        <path d="M -2,72 Q 30,68 60,74 Q 96,80 130,76 Q 160,72 200,76" />
        <path d="M -2,134 Q 40,128 80,134 Q 120,140 200,136" />
        <path d="M 16,-2 Q 22,30 18,60 Q 14,90 22,150" />
        <path d="M 70,-2 Q 76,30 72,62 Q 68,98 78,150" />
        <path d="M 124,-2 Q 130,30 126,60 Q 122,92 134,150" />
        <path d="M 170,-2 Q 176,30 172,60 Q 168,90 178,150" />
        {/* Diagonal connectors */}
        <path d="M 30,18 Q 70,52 110,72" />
        <path d="M 80,18 Q 110,42 150,68" />
        <path d="M 0,80 Q 30,90 60,98 Q 90,104 124,104" />
      </g>

      {/* 5. Major arterials — slightly thicker primary lines */}
      <g fill="none" stroke={streetMaj} strokeWidth="1" strokeLinecap="round">
        <path d="M -2,60 Q 50,52 100,66 Q 150,80 200,72" />
        <path d="M 42,-2 Q 50,40 64,80 Q 78,120 72,150" />
        <path d="M 200,28 Q 168,34 138,30 Q 108,26 78,38" />
      </g>

      {/* 6. Interstate — single amber sweep with soft halo */}
      <g fill="none" strokeLinecap="round">
        <path
          d="M -2,96 Q 56,86 110,104 Q 162,120 202,110"
          stroke={alpha(highway, 0.22)}
          strokeWidth="3.6"
        />
        <path
          d="M -2,96 Q 56,86 110,104 Q 162,120 202,110"
          stroke={highway}
          strokeWidth="1.3"
        />
      </g>
    </Box>
  );
};

// ---------- Pin variants -------------------------------------------------

// Pin status palette — matches the Public-Map PRD (FR-10).
//   live      → green   ("show is on right now")
//   scheduled → amber   ("starts at sundown")
//   offline   → gray    ("dark tonight")
//   active    → uses secondary (amber) so the user's selected pin stands
//               apart from the live/scheduled status colours.
const STATUS = {
  live:      { color: '#22c55e' },
  scheduled: { color: '#eab308' },
  offline:   { color: '#6b7280' }
};
const CLUSTER_COLOR = '#c41e3a'; // Christmas red, per PRD §8.3 sketch

const ClusterPin = ({ x, y, count }) => (
  <Box
    sx={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      width: 26,
      height: 26,
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      bgcolor: alpha(CLUSTER_COLOR, 0.95),
      color: '#fff',
      fontSize: 9.5,
      fontWeight: 800,
      letterSpacing: '0.02em',
      boxShadow: `0 0 0 4px ${alpha(CLUSTER_COLOR, 0.20)}, 0 4px 10px rgba(0,0,0,0.32)`
    }}
  >
    +{count}
  </Box>
);
ClusterPin.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  count: PropTypes.number.isRequired
};

const DropPin = ({ x, y, status = 'live', active }) => {
  const color = active ? '#f4b860' : STATUS[status].color;
  return (
    <Box
      sx={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: 'translate(-50%, -100%)',
        color,
        filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))'
      }}
    >
      {active && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: '50%',
            top: '78%',
            width: 22,
            height: 22,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            bgcolor: alpha(color, 0.4),
            animation: `${ping} 2s ease-out infinite`
          }}
        />
      )}
      <IconMapPinFilled size={active ? 24 : 17} />
    </Box>
  );
};
DropPin.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  status: PropTypes.oneOf(['live', 'scheduled', 'offline']),
  active: PropTypes.bool
};

// ---------- Popup card --------------------------------------------------

const PopupCard = ({ x, y }) => (
  <Box
    sx={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -100%)',
      px: 1,
      py: 0.85,
      minWidth: 130,
      borderRadius: 1.25,
      bgcolor: (theme) =>
        theme.palette.mode === 'dark'
          ? alpha(theme.palette.background.paper, 0.96)
          : alpha('#ffffff', 0.96),
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: (t) => t.customShadows?.elevated ?? t.shadows[8],
      // Tail pointing to the pin
      '&::after': {
        content: '""',
        position: 'absolute',
        bottom: -5,
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: 8,
        height: 8,
        bgcolor: 'inherit',
        borderRight: '1px solid',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }
    }}
  >
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: 0.75,
          flexShrink: 0,
          bgcolor: (theme) => alpha(theme.palette.error.main, 0.18),
          border: (theme) => `1px solid ${alpha(theme.palette.error.main, 0.45)}`,
          color: 'error.main',
          display: 'grid',
          placeItems: 'center',
          fontSize: 8.5,
          fontWeight: 800,
          letterSpacing: '0.04em'
        }}
      >
        PL
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 10.5,
            fontWeight: 700,
            color: 'text.primary',
            lineHeight: 1.1,
            whiteSpace: 'nowrap'
          }}
        >
          Pine Lights
        </Typography>
        <Typography
          sx={{
            fontSize: 8,
            color: 'text.secondary',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            mt: 0.15
          }}
        >
          {/* Easter egg: 0.42 mi — Hitchhiker's Guide to the Galaxy nod. */}
          0.42 mi · 47 sequences
        </Typography>
      </Box>
    </Stack>
  </Box>
);
PopupCard.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired
};

// ---------- Top search bar -----------------------------------------------

const SearchBar = () => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={0.85}
    sx={{
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      px: 1,
      py: 0.65,
      borderRadius: 1.25,
      bgcolor: (theme) =>
        theme.palette.mode === 'dark'
          ? alpha(theme.palette.background.paper, 0.85)
          : alpha('#ffffff', 0.92),
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: (t) => t.customShadows?.subtle ?? t.shadows[2],
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)'
    }}
  >
    <IconSearch size={11} stroke={2.25} style={{ flexShrink: 0, opacity: 0.7 }} />
    <Typography
      sx={{
        fontSize: 9.5,
        color: 'text.secondary',
        flex: 1,
        whiteSpace: 'nowrap'
      }}
    >
      Search shows near you
    </Typography>
    <Box
      sx={{
        px: 0.7,
        py: 0.15,
        borderRadius: '999px',
        bgcolor: (theme) => alpha(theme.palette.success.main, 0.18),
        color: 'success.main',
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.06em'
      }}
    >
      LIVE
    </Box>
  </Stack>
);

// ---------- Bottom stat -------------------------------------------------

const StatChip = () => (
  <Box
    sx={{
      position: 'absolute',
      bottom: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      px: 1.25,
      py: 0.5,
      borderRadius: '999px',
      bgcolor: (theme) =>
        theme.palette.mode === 'dark'
          ? alpha(theme.palette.background.paper, 0.85)
          : alpha('#ffffff', 0.92),
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: (t) => t.customShadows?.subtle ?? t.shadows[2],
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      whiteSpace: 'nowrap'
    }}
  >
    <Typography sx={{ fontSize: 9, color: 'text.secondary', fontWeight: 500 }}>
      <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>
        {/* Easter egg: 1,225 = Dec 25 */}
        1,225
      </Box>{' '}
      shows mapped this season
    </Typography>
  </Box>
);

// ---------- Composite ----------------------------------------------------

const ShowsMapPreview = () => (
  <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit' }}>
    <MapBackdrop />

    {/* Pins: a mix of clusters (red, per PRD §8.3) and status-coloured
        drops — green=live, amber=scheduled, gray=offline (FR-10). */}
    <ClusterPin x={22} y={42} count={12} />
    <ClusterPin x={68} y={30} count={8} />
    <ClusterPin x={84} y={70} count={5} />
    <DropPin    x={40} y={70} status="live" />
    <DropPin    x={78} y={50} status="scheduled" />
    <DropPin    x={18} y={66} status="offline" />
    <DropPin    x={62} y={84} status="live" />

    {/* Active pin (your show — selected) */}
    <DropPin x={50} y={56} active />

    {/* Popup attached to active pin */}
    <PopupCard x={50} y={36} />

    {/* Overlays */}
    <SearchBar />
    <StatChip />
  </Box>
);

export default ShowsMapPreview;
