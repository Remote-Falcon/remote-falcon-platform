import { Box, Chip, Container, Grid, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { IconBrandGithub, IconLayoutGrid, IconMapPin, IconMusic } from '@tabler/icons-react';
import PropTypes from 'prop-types';

import CommunityPreview from './visuals/CommunityPreview';
import JukeboxPreview from './visuals/JukeboxPreview';
import ShowsMapPreview from './visuals/ShowsMapPreview';
import ViewerPagePreview from './visuals/ViewerPagePreview';

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const Eyebrow = ({ children }) => (
  <Typography
    sx={{
      color: 'secondary.main',
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      mb: 1.5
    }}
  >
    {children}
  </Typography>
);
Eyebrow.propTypes = { children: PropTypes.node };

const IconTile = ({ icon: Icon, tone }) => (
  <Box
    sx={{
      width: 44,
      height: 44,
      borderRadius: 1.5,
      display: 'grid',
      placeItems: 'center',
      mb: 2.5,
      // Tinted to brand color at 14%, with a 28% border match.
      bgcolor: (theme) => alpha(theme.palette[tone].main, 0.14),
      border: (theme) => `1px solid ${alpha(theme.palette[tone].main, 0.28)}`,
      color: (theme) => theme.palette[tone].main
    }}
  >
    <Icon size={22} stroke={2} />
  </Box>
);
IconTile.propTypes = { icon: PropTypes.elementType.isRequired, tone: PropTypes.string.isRequired };

const FeatureBullet = ({ children }) => (
  <Stack direction="row" spacing={1.5} alignItems="flex-start">
    <Box
      component="span"
      sx={{
        color: 'primary.main',
        fontWeight: 700,
        fontSize: 15,
        mt: '1px',
        flexShrink: 0
      }}
    >
      ✓
    </Box>
    <Typography component="span" variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
      {children}
    </Typography>
  </Stack>
);
FeatureBullet.propTypes = { children: PropTypes.node };

const SoonBadge = () => (
  <Chip
    label="Soon"
    size="small"
    sx={{
      bgcolor: (t) => alpha(t.palette.secondary.main, 0.18),
      color: 'secondary.main',
      border: (t) => `1px solid ${alpha(t.palette.secondary.main, 0.32)}`,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      height: 20,
      '& .MuiChip-label': { px: '8px' }
    }}
  />
);

// Framed visual surface — gradient backdrop + soft border + shadow.
// Children render absolutely-positioned over the backdrop. Until the
// real screenshots land, each FeatureBlock can pass a stylized v2
// mockup component as `children`.
const VisualCard = ({ palette: visualPalette = ['primary', 'secondary'], children }) => (
  <Box
    sx={{
      aspectRatio: '4/3',
      borderRadius: 2,
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: (t) => t.customShadows?.medium ?? t.shadows[4],
      position: 'relative',
      overflow: 'hidden',
      background: (theme) => `
        radial-gradient(circle at 30% 30%, ${alpha(theme.palette[visualPalette[0]].main, 0.18)}, transparent 50%),
        radial-gradient(circle at 70% 70%, ${alpha(theme.palette[visualPalette[1]].main, 0.18)}, transparent 55%),
        ${theme.palette.background.paper}
      `
    }}
  >
    {children}
  </Box>
);
VisualCard.propTypes = {
  palette: PropTypes.arrayOf(PropTypes.string),
  children: PropTypes.node
};

// ---------------------------------------------------------------------------
// Feature block — alternating left/right text + visual
// ---------------------------------------------------------------------------

const FeatureBlock = ({ icon, tone, heading, body, bullets, badge, visual, visualPalette, reverse, anchor }) => (
  <Grid
    container
    id={anchor}
    spacing={{ xs: 4, md: 8 }}
    alignItems="center"
    direction={{ xs: 'row', md: reverse ? 'row-reverse' : 'row' }}
    sx={{ mb: { xs: 7, md: 10 }, '&:last-of-type': { mb: 0 } }}
  >
    <Grid item xs={12} md={6}>
      <IconTile icon={icon} tone={tone} />
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.75, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography
          variant="h3"
          sx={{
            fontSize: { xs: '1.5rem', md: '1.75rem' },
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.2
          }}
        >
          {heading}
        </Typography>
        {badge && <SoonBadge />}
      </Stack>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5, maxWidth: '44ch', lineHeight: 1.6 }}>
        {body}
      </Typography>
      <Stack spacing={1.5}>
        {bullets.map((b) => (
          <FeatureBullet key={b}>{b}</FeatureBullet>
        ))}
      </Stack>
    </Grid>
    <Grid item xs={12} md={6}>
      <VisualCard palette={visualPalette}>{visual}</VisualCard>
    </Grid>
  </Grid>
);
FeatureBlock.propTypes = {
  icon: PropTypes.elementType.isRequired,
  tone: PropTypes.string.isRequired,
  heading: PropTypes.string.isRequired,
  body: PropTypes.string.isRequired,
  bullets: PropTypes.arrayOf(PropTypes.string).isRequired,
  badge: PropTypes.string,
  visual: PropTypes.node,
  visualPalette: PropTypes.arrayOf(PropTypes.string),
  reverse: PropTypes.bool,
  anchor: PropTypes.string
};

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: IconMusic,
    tone: 'primary',
    heading: 'Jukebox queue & live voting',
    body: 'Pick the mode that fits the night — viewers either request the next song (Jukebox) or vote on what plays (Voting).',
    bullets: [
      "Jukebox queue with sequence-request limits and queue-depth caps so one viewer can't hog the show",
      'Voting rounds let viewers pick what plays next — highest tally wins the round',
      'Group sequences into categories, control visibility per sequence, hide a song after it plays'
    ],
    visualPalette: ['error', 'secondary'],
    visual: <JukeboxPreview />
  },
  {
    icon: IconLayoutGrid,
    tone: 'secondary',
    heading: 'A viewer page you actually own',
    body: 'Start from a template, or write your own HTML/CSS. The editor validates your markup as you go.',
    bullets: [
      'Templates included — pick one and tweak, or start from scratch',
      'Inline HTML validation flags mistakes as you type',
      'Your own subdomain on remotefalcon.com (auto-created from your show name)'
    ],
    reverse: true,
    visualPalette: ['primary', 'primary'],
    visual: <ViewerPagePreview />
  },
  {
    icon: IconMapPin,
    tone: 'primary',
    heading: 'Find & be found on the Shows Map',
    body: 'Opt in to the global Remote Falcon shows map and let viewers discover light shows nearby.',
    bullets: [
      'Pin your show with a single toggle in the control panel',
      'Map auto-clusters shows by region as viewers pan and zoom',
      "100% opt-in — you control whether your show appears"
    ],
    badge: 'Soon',
    anchor: 'shows-map',
    visualPalette: ['primary', 'error'],
    visual: <ShowsMapPreview />
  },
  {
    icon: IconBrandGithub,
    tone: 'error',
    heading: 'Open source & community-driven',
    body: 'Free to get started, open source for anyone to audit or contribute, and supported by a community of show owners helping each other.',
    bullets: [
      'Free to start — no credit card required',
      'Open source on GitHub — fork it, audit it, contribute back',
      'Community-supported via the Remote Falcon Facebook group and Patreon'
    ],
    reverse: true,
    visualPalette: ['error', 'secondary'],
    visual: <CommunityPreview />
  }
];

const FeaturePage = () => (
  <Box id="features" sx={{ scrollMarginTop: 96 }}>
    <Container sx={{ py: { xs: 7, md: 10 } }}>
      <Box sx={{ mb: { xs: 5, md: 7 }, maxWidth: '56ch' }}>
        <Eyebrow>Top features</Eyebrow>
        <Typography
          variant="h2"
          component="h2"
          sx={{
            fontSize: { xs: '1.75rem', md: '2.75rem' },
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            mb: 2
          }}
        >
          Everything you need to run an interactive show.
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: 17, lineHeight: 1.6 }}>
          From the first vote to the final song, give your viewers a reason to come back every night.
        </Typography>
      </Box>

      {FEATURES.map((f) => (
        <FeatureBlock key={f.heading} {...f} />
      ))}
    </Container>
  </Box>
);

export default FeaturePage;
