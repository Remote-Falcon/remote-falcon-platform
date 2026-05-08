/**
 * <CommunityPreview />
 *
 * Decorative preview for the "Open source & community-driven" feature
 * block. A GitHub-style repository feed: repo header with star /
 * contributor stats, a list of recent community activity (PR merged,
 * commit, PR opened — each tied to a contributor avatar), and a
 * contributor mosaic at the bottom suggesting the long-tail. Pure JSX.
 */

import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';
import {
  IconBrandGithub,
  IconGitCommit,
  IconGitMerge,
  IconGitPullRequest,
  IconStarFilled,
  IconUsers
} from '@tabler/icons-react';

// ---------- Avatar (initials in a tinted circle) -------------------------

const Avatar = ({ initials, color, size = 22 }) => (
  <Box
    sx={{
      width: size,
      height: size,
      borderRadius: '50%',
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      bgcolor: color,
      color: '#fff',
      fontSize: size * 0.42,
      fontWeight: 800,
      letterSpacing: '0.02em',
      lineHeight: 1,
      boxShadow: `0 0 0 1.5px rgba(255,255,255,0.06)`
    }}
  >
    {initials}
  </Box>
);
Avatar.propTypes = {
  initials: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  size: PropTypes.number
};

// Brand-aligned avatar palette — strict navy/amber/red plus two muted
// neutrals so the mosaic reads as varied without leaving the family.
const AVATAR_TONES = [
  '#1e3a8a', // navy (primary)
  '#c41e3a', // christmas red
  '#f4b860', // amber (secondary)
  '#6b3fa0', // muted violet
  '#3a8c9c', // muted teal
  '#a83248', // muted crimson
  '#2a5fa3', // muted azure
  '#cf7a3a'  // muted ochre
];

// ---------- Repo header (top) --------------------------------------------

const RepoHeader = () => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={0.85}
    sx={{
      px: 1.5,
      py: 1,
      borderBottom: '1px solid',
      borderColor: 'divider',
      bgcolor: (theme) =>
        theme.palette.mode === 'dark'
          ? alpha(theme.palette.background.paper, 0.55)
          : alpha('#f5f6fa', 1)
    }}
  >
    <IconBrandGithub size={16} stroke={1.75} style={{ flexShrink: 0 }} />
    <Typography
      sx={{
        fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.01em'
      }}
    >
      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>
        github.com/
      </Box>
      <Box component="span" sx={{ color: 'text.primary' }}>
        Remote-Falcon
      </Box>
      {/* Easter egg: real first-commit date on the org's UI repo
          (2024-04-24, per gh api). */}
      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
        {' '}· since Apr ’24
      </Box>
    </Typography>
    <Box sx={{ flexGrow: 1 }} />
    {/* MIT license chip — quiet attribution, real fact */}
    <Box
      sx={{
        px: 0.7,
        py: 0.2,
        borderRadius: '999px',
        border: '1px solid',
        borderColor: 'divider',
        color: 'text.secondary',
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: '0.08em'
      }}
    >
      MIT
    </Box>
    {/* Star chip */}
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.4}
      sx={{
        px: 0.7,
        py: 0.2,
        borderRadius: '999px',
        border: '1px solid',
        borderColor: 'divider',
        color: 'secondary.main'
      }}
    >
      <IconStarFilled size={9} />
      <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'text.primary' }}>
        {/* Easter egg: 1,225 = Dec 25 */}
        1,225
      </Typography>
    </Stack>
    {/* Contributors chip */}
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.4}
      sx={{
        px: 0.7,
        py: 0.2,
        borderRadius: '999px',
        border: '1px solid',
        borderColor: 'divider',
        color: (theme) => alpha(theme.palette.primary.main, 0.85)
      }}
    >
      <IconUsers size={9} stroke={2.25} />
      <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'text.primary' }}>
        97
      </Typography>
    </Stack>
  </Stack>
);

// ---------- Section header ----------------------------------------------

const SectionLabel = ({ children, mt }) => (
  <Typography
    sx={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: 'text.secondary',
      mt: mt ?? 0,
      mb: 0.5,
      px: 0.25
    }}
  >
    {children}
  </Typography>
);
SectionLabel.propTypes = { children: PropTypes.node, mt: PropTypes.number };

// ---------- Activity row -------------------------------------------------

const ACTIVITY_TYPES = {
  merged:    { icon: IconGitMerge,       color: '#a78bfa', label: 'Merged'    },
  committed: { icon: IconGitCommit,      color: '#9aa3b2', label: 'Committed' },
  opened:    { icon: IconGitPullRequest, color: '#22c55e', label: 'Opened'    }
};

const ActivityRow = ({ author, initials, avatarColor, type, message, when }) => {
  const { icon: TypeIcon, color: typeColor, label } = ACTIVITY_TYPES[type];
  return (
    <Stack
      direction="row"
      spacing={0.9}
      alignItems="flex-start"
      sx={{
        py: 0.65,
        px: 0.5,
        borderRadius: 1,
        '&:hover': {
          bgcolor: (theme) => alpha(theme.palette.background.paper, 0.45)
        }
      }}
    >
      <Avatar initials={initials} color={avatarColor} size={22} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 600,
            lineHeight: 1.25,
            color: 'text.primary',
            fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {message}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.4} sx={{ mt: 0.2 }}>
          <Box sx={{ color: typeColor, display: 'flex' }}>
            <TypeIcon size={10} stroke={2.2} />
          </Box>
          <Typography sx={{ fontSize: 8.5, color: 'text.secondary', fontWeight: 600 }}>
            {label}
          </Typography>
          <Typography sx={{ fontSize: 8.5, color: 'text.secondary' }}>·</Typography>
          <Typography sx={{ fontSize: 8.5, color: 'text.secondary', fontWeight: 600 }}>
            {author}
          </Typography>
          <Typography sx={{ fontSize: 8.5, color: 'text.secondary' }}>·</Typography>
          <Typography sx={{ fontSize: 8.5, color: 'text.secondary' }}>{when}</Typography>
        </Stack>
      </Box>
    </Stack>
  );
};
ActivityRow.propTypes = {
  author: PropTypes.string.isRequired,
  initials: PropTypes.string.isRequired,
  avatarColor: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['merged', 'committed', 'opened']).isRequired,
  message: PropTypes.string.isRequired,
  when: PropTypes.string.isRequired
};

// Easter egg: the two latest contributors are JV (James Vance — original
// creator) and MS (Matt Shorts). Third row stays a community handle so
// the feed still reads as "many people, not just two".
const ACTIVITY = [
  {
    author: 'jvance',
    initials: 'JV',
    avatarColor: AVATAR_TONES[0],
    type: 'merged',
    message: 'feat(map): cluster pins below zoom 10',
    when: '3h ago'
  },
  {
    author: 'mshorts',
    initials: 'MS',
    avatarColor: AVATAR_TONES[2],
    type: 'committed',
    message: 'fix(auth): map INVALID_JWT → HTTP 401',
    when: '1d ago'
  },
  {
    author: 'neonpixel',
    initials: 'NP',
    avatarColor: AVATAR_TONES[1],
    type: 'opened',
    // Easter egg: TSO's "Wizards in Winter" is a community staple —
    // probably the most-sequenced track in the RF universe.
    message: 'fix: Wizards in Winter sync drift',
    when: '3d ago'
  }
];

// ---------- Contributor mosaic ------------------------------------------

// JV + MS lead — same easter egg as the activity feed above. The rest are
// invented community handles (LS=lightsmith, NP=neonpixel, etc).
const CONTRIBUTORS = [
  { initials: 'JV', tone: 0 },
  { initials: 'MS', tone: 2 },
  { initials: 'NP', tone: 1 },
  { initials: 'SG', tone: 3 },
  { initials: 'PP', tone: 4 },
  { initials: 'FB', tone: 5 },
  { initials: 'KW', tone: 6 },
  { initials: 'RM', tone: 7 }
];

const ContributorMosaic = () => (
  <Stack direction="row" alignItems="center" spacing={0.4}>
    {CONTRIBUTORS.map((c) => (
      <Avatar key={c.initials} initials={c.initials} color={AVATAR_TONES[c.tone]} size={20} />
    ))}
    <Box
      sx={{
        ml: '4px !important',
        height: 20,
        px: 0.85,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        bgcolor: (theme) => alpha(theme.palette.text.primary, 0.08),
        border: '1px dashed',
        borderColor: 'divider'
      }}
    >
      <Typography sx={{ fontSize: 8.5, color: 'text.secondary', fontWeight: 700 }}>
        +89 more
      </Typography>
    </Box>
  </Stack>
);

// ---------- Composite ----------------------------------------------------

const CommunityPreview = () => (
  <Box
    sx={{
      position: 'absolute',
      inset: 0,
      p: { xs: 2, md: 2.5 },
      display: 'flex',
      alignItems: 'stretch',
      justifyContent: 'center'
    }}
  >
    <Box
      sx={{
        flex: 1,
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? alpha('#0a0e16', 0.92)
            : alpha('#f6f7fb', 1),
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: (t) => t.customShadows?.elevated ?? t.shadows[6]
      }}
    >
      <RepoHeader />

      <Box sx={{ flex: 1, p: 1.25, display: 'flex', flexDirection: 'column' }}>
        <SectionLabel>Recent activity</SectionLabel>
        <Stack spacing={0}>
          {ACTIVITY.map((a) => (
            <ActivityRow key={a.author} {...a} />
          ))}
        </Stack>

        <Box sx={{ flexGrow: 1 }} />

        <SectionLabel mt={1}>Contributors</SectionLabel>
        <ContributorMosaic />
      </Box>
    </Box>
  </Box>
);

export default CommunityPreview;
