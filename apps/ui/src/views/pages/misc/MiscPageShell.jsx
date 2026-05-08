/**
 * <MiscPageShell />
 *
 * Wrapper for "static prose" public routes — privacy policy, terms,
 * ownership. Provides:
 *   - The marketing AppBar at top so users can navigate back home,
 *     toggle theme, etc.
 *   - A centered, max-width prose container.
 *   - Tasteful default styling for raw <p>/<ul>/<a>/<strong> markup
 *     that already lives in the legacy pages — no content rewrite
 *     needed.
 *
 * Pass `title` for the H1; whatever you put in `children` renders
 * directly below it.
 */

import { Box, Container, Typography } from '@mui/material';
import PropTypes from 'prop-types';

import AppBar from '../../../ui-component/extended/AppBar';

const MiscPageShell = ({ title, children }) => (
  <Box sx={{ overflowX: 'hidden', minHeight: '100vh', bgcolor: 'background.default' }}>
    <AppBar />
    <Container
      maxWidth="md"
      sx={{
        py: { xs: 6, md: 10 },
        // Style the inline HTML the legacy pages emit — no content edits.
        '& p': { color: 'text.secondary', lineHeight: 1.7, fontSize: 15, mb: 2 },
        '& ul, & ol': { color: 'text.secondary', lineHeight: 1.7, fontSize: 15, pl: 3, mb: 2 },
        '& li': { mb: 0.75 },
        '& a': {
          color: 'secondary.main',
          textDecoration: 'underline',
          textUnderlineOffset: 2
        },
        '& a:hover': { color: 'secondary.dark' },
        '& strong': {
          color: 'text.primary',
          // When a <strong> is the only child of a block-level context,
          // it acts as a section heading. The display:block doesn't
          // affect inline-emphasis usage because <strong> is naturally
          // inline; this rule only kicks in when the markup uses it
          // as a block (which the legacy pages do, separated by <br />).
          display: 'inline-block',
          fontSize: '1.0625rem',
          fontWeight: 700,
          mt: 3,
          mb: 1
        },
        '& br': { display: 'none' } // legacy pages use <br /> for spacing — kill them; spacing is via mt/mb above
      }}
    >
      {title && (
        <Typography
          variant="h1"
          component="h1"
          sx={{
            fontSize: { xs: '2rem', md: '2.75rem' },
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            mb: 4
          }}
        >
          {title}
        </Typography>
      )}
      {children}
    </Container>
  </Box>
);

MiscPageShell.propTypes = {
  title: PropTypes.node,
  children: PropTypes.node.isRequired
};

export default MiscPageShell;
