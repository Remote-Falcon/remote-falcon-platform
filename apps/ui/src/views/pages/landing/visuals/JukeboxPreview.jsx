/**
 * <JukeboxPreview />
 *
 * Decorative preview for the "Jukebox queue & live voting" feature block.
 * Two phone frames side-by-side, separated by a stylized "OR" badge.
 * Each phone shows a fake show brand at the top so it reads as
 * "this is what your viewers see when they open your show page".
 */

import { Box, Stack, Typography } from '@mui/material';
import { alpha, keyframes } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { IconMusic } from '@tabler/icons-react';

import PhoneFrame from './PhoneFrame';

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
`;

// ---------- Show brand (top of each screen) ------------------------------

const ShowBrand = ({ initials, name, tone }) => (
  <Stack direction="column" alignItems="center" spacing={0.5} sx={{ mt: 0.25, mb: 0.5 }}>
    <Box
      sx={{
        width: 36,
        height: 36,
        borderRadius: 1.5,
        flexShrink: 0,
        bgcolor: (theme) => alpha(theme.palette[tone].main, 0.18),
        border: (theme) => `1.5px solid ${alpha(theme.palette[tone].main, 0.5)}`,
        color: (theme) => theme.palette[tone].main,
        display: 'grid',
        placeItems: 'center',
        fontSize: 14,
        fontWeight: 800,
        letterSpacing: '0.06em',
        boxShadow: (theme) => `0 6px 14px ${alpha(theme.palette[tone].main, 0.22)}`
      }}
    >
      {initials}
    </Box>
    <Typography
      sx={{
        fontSize: 13,
        fontWeight: 700,
        color: 'text.primary',
        letterSpacing: '-0.005em',
        lineHeight: 1,
        textAlign: 'center'
      }}
    >
      {name}
    </Typography>
  </Stack>
);
ShowBrand.propTypes = {
  initials: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  tone: PropTypes.string.isRequired
};

// ---------- Mode subhead (just below brand) -------------------------------

const ModeRow = ({ label, right }) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={0.5}
    sx={{
      pt: 0.5,
      mb: 0.75,
      borderTop: '1px solid',
      borderColor: 'divider'
    }}
  >
    <Typography
      sx={{
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'secondary.main',
        pt: 0.5
      }}
    >
      {label}
    </Typography>
    <Box sx={{ flexGrow: 1 }} />
    <Box sx={{ pt: 0.5 }}>{right}</Box>
  </Stack>
);
ModeRow.propTypes = { label: PropTypes.node, right: PropTypes.node };

// ---------- Jukebox screen -----------------------------------------------

const QUEUE = [
  { title: 'Carol of the Bells', artist: 'TSO',          status: 'now-playing' },
  { title: 'Sleigh Ride',        artist: 'Anderson',     status: 'next' },
  { title: 'Linus and Lucy',     artist: 'Guaraldi',     status: 'queued', position: 3 }
];

const QueueRow = ({ track }) => {
  const isNow = track.status === 'now-playing';
  const isNext = track.status === 'next';
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      sx={{
        px: 0.85,
        py: 0.6,
        borderRadius: 1,
        bgcolor: (theme) =>
          isNow
            ? alpha(theme.palette.secondary.main, 0.16)
            : alpha(theme.palette.background.paper, 0.6),
        border: (theme) =>
          `1px solid ${isNow ? alpha(theme.palette.secondary.main, 0.36) : theme.palette.divider}`
      }}
    >
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: 0.75,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          bgcolor: (theme) =>
            isNow
              ? alpha(theme.palette.secondary.main, 0.24)
              : alpha(theme.palette.primary.main, 0.18),
          color: (theme) =>
            isNow ? theme.palette.secondary.main : theme.palette.primary.main
        }}
      >
        <IconMusic size={10} stroke={2.5} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontSize: 9.5,
            fontWeight: 600,
            lineHeight: 1.15,
            color: 'text.primary',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {track.title}
        </Typography>
        <Typography
          sx={{
            fontSize: 8,
            lineHeight: 1.15,
            color: 'text.secondary'
          }}
        >
          {track.artist}
        </Typography>
      </Box>
      {isNow && (
        <Box
          sx={{
            px: 0.5,
            py: 0.05,
            borderRadius: '999px',
            bgcolor: 'secondary.main',
            color: 'secondary.contrastText',
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase'
          }}
        >
          Now playing
        </Box>
      )}
      {isNext && (
        <Box
          sx={{
            px: 0.5,
            py: 0.05,
            borderRadius: '999px',
            border: (theme) => `1px solid ${alpha(theme.palette.secondary.main, 0.5)}`,
            color: 'secondary.main',
            fontSize: 7,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase'
          }}
        >
          Next
        </Box>
      )}
      {!isNow && !isNext && (
        <Typography sx={{ fontSize: 8, color: 'text.secondary', fontWeight: 600 }}>
          #{track.position}
        </Typography>
      )}
    </Stack>
  );
};
QueueRow.propTypes = { track: PropTypes.object.isRequired };

const JukeboxScreen = () => (
  <PhoneFrame>
    <ShowBrand initials="PL" name="Pine Lights" tone="error" />
    <ModeRow
      label="Jukebox"
      right={
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              bgcolor: 'success.main',
              animation: `${pulse} 1.6s ease-in-out infinite`
            }}
          />
          {/* Easter egg: 47 — the iconic Star Trek / hacker number. */}
          <Typography sx={{ fontSize: 8, color: 'text.secondary', fontWeight: 600 }}>
            Live · 47
          </Typography>
        </Stack>
      }
    />
    <Stack spacing={0.5}>
      {QUEUE.map((q) => (
        <QueueRow key={q.title} track={q} />
      ))}
    </Stack>
  </PhoneFrame>
);

// ---------- Voting screen ------------------------------------------------

const VOTES = [
  { title: 'Wizards in Winter',     pct: 47, leading: true },
  { title: 'Linus and Lucy',        pct: 32 },
  // Easter egg: TSO is the Christmas-light-show patron saint —
  // referencing the band by name lands with the RF community.
  { title: 'Trans-Siberian Medley', pct: 21 }
];

const VoteRow = ({ track }) => (
  <Stack spacing={0.25}>
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Typography
        sx={{
          fontSize: 9.5,
          fontWeight: 600,
          color: 'text.primary',
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {track.title}
      </Typography>
      <Typography
        sx={{
          fontSize: 9.5,
          fontWeight: 700,
          color: track.leading ? 'secondary.main' : 'text.primary',
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {track.pct}%
      </Typography>
    </Stack>
    <Box
      sx={{
        height: 4,
        borderRadius: 999,
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          width: `${track.pct}%`,
          height: '100%',
          borderRadius: 999,
          bgcolor: (theme) =>
            track.leading ? theme.palette.secondary.main : alpha(theme.palette.primary.main, 0.55)
        }}
      />
    </Box>
  </Stack>
);
VoteRow.propTypes = { track: PropTypes.object.isRequired };

const VotingScreen = () => (
  <PhoneFrame>
    {/* Easter egg: "Vance Lane" is a nod to James Vance, the original
        Remote Falcon creator. Reads as a fictional show name first,
        homage second. */}
    <ShowBrand initials="VL" name="Vance Lane" tone="primary" />
    <ModeRow
      label="Voting"
      right={
        <Typography sx={{ fontSize: 8, color: 'text.secondary', fontWeight: 600 }}>
          {/* Easter egg: 1:25 = Dec 25 */}
          1:25
        </Typography>
      }
    />
    <Stack spacing={0.85}>
      {VOTES.map((v) => (
        <VoteRow key={v.title} track={v} />
      ))}
    </Stack>
  </PhoneFrame>
);

// ---------- OR badge -----------------------------------------------------

const OrBadge = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flexShrink: 0,
      gap: 0.75,
      flex: '0 0 auto'
    }}
  >
    {/* Top tick line */}
    <Box
      sx={{
        width: '1px',
        flex: 1,
        bgcolor: 'divider'
      }}
    />
    {/* Pill badge */}
    <Box
      sx={{
        px: 1.25,
        py: 0.4,
        borderRadius: '999px',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.secondary.main, 0.4),
        boxShadow: (t) => t.customShadows?.subtle ?? t.shadows[2]
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.18em',
          color: 'secondary.main'
        }}
      >
        OR
      </Typography>
    </Box>
    {/* Bottom tick line */}
    <Box
      sx={{
        width: '1px',
        flex: 1,
        bgcolor: 'divider'
      }}
    />
  </Box>
);

// ---------- Composite ----------------------------------------------------

const JukeboxPreview = () => (
  <Box
    sx={{
      position: 'absolute',
      inset: 0,
      p: { xs: 2, md: 2.5 },
      display: 'flex',
      gap: { xs: 1.5, md: 2.5 },
      alignItems: 'stretch',
      justifyContent: 'center'
    }}
  >
    <JukeboxScreen />
    <OrBadge />
    <VotingScreen />
  </Box>
);

export default JukeboxPreview;
