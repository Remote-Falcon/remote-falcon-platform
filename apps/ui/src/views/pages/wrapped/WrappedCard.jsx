import * as React from 'react';

import { Box, Fade, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

// One slide in the Wrapped slide deck. Rendered as the only visible
// card at a time (driven by parent state). Fade-in animation on each
// new slide so it doesn't feel static.
//
// Slots (each optional, rendered top → bottom):
//   eyebrow  — small uppercase tagline
//   intro    — medium pre-headline copy
//   headline — large display text
//   outro    — medium post-headline copy
//   big      — the giant statistic
//   bigUnit  — small inline label next to the big number
//   caption  — small closer at the bottom
const WrappedCard = ({ card, accent, accentBright, visible }) => (
  <Fade in={visible} timeout={{ enter: 600, exit: 250 }} appear unmountOnExit>
    <Box
      data-testid="wrapped-card"
      data-card-key={card.key}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
        py: 6
      }}
    >
      <Stack spacing={3} alignItems="center" sx={{ textAlign: 'center', maxWidth: 760 }}>
        {card.eyebrow && (
          <Typography
            sx={{
              color: accent,
              letterSpacing: '0.18em',
              fontWeight: 700,
              fontSize: { xs: 12, md: 14 },
              textTransform: 'uppercase'
            }}
          >
            {card.eyebrow}
          </Typography>
        )}

        {card.intro && (
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.85)',
              fontWeight: 400,
              fontSize: { xs: 18, md: 22 },
              lineHeight: 1.4
            }}
          >
            {card.intro}
          </Typography>
        )}

        {card.headline && (
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: { xs: 36, md: card.closing ? 64 : 56 },
              lineHeight: 1.05,
              color: '#fff',
              wordBreak: 'break-word'
            }}
          >
            {card.headline}
          </Typography>
        )}

        {card.outro && (
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.85)',
              fontWeight: 400,
              fontSize: { xs: 18, md: 22 },
              lineHeight: 1.4
            }}
          >
            {card.outro}
          </Typography>
        )}

        {card.big && (
          <Stack
            direction="row"
            alignItems="baseline"
            spacing={1.5}
            sx={{ mt: 1, justifyContent: 'center', flexWrap: 'wrap' }}
          >
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: { xs: 96, md: 144 },
                lineHeight: 1,
                color: accentBright,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {card.big}
            </Typography>
            {card.bigUnit && (
              <Typography
                sx={{
                  fontWeight: 500,
                  fontSize: { xs: 18, md: 28 },
                  color: 'rgba(255,255,255,0.7)'
                }}
              >
                {card.bigUnit}
              </Typography>
            )}
          </Stack>
        )}

        {card.caption && (
          <Typography
            sx={{
              fontWeight: 400,
              fontSize: { xs: 14, md: 18 },
              color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.4,
              mt: 1
            }}
          >
            {card.caption}
          </Typography>
        )}
      </Stack>
    </Box>
  </Fade>
);

WrappedCard.propTypes = {
  card: PropTypes.shape({
    key: PropTypes.string,
    eyebrow: PropTypes.string,
    intro: PropTypes.string,
    headline: PropTypes.string,
    outro: PropTypes.string,
    big: PropTypes.string,
    bigUnit: PropTypes.string,
    caption: PropTypes.string,
    closing: PropTypes.bool
  }).isRequired,
  accent: PropTypes.string.isRequired,
  accentBright: PropTypes.string.isRequired,
  visible: PropTypes.bool
};

export default WrappedCard;
