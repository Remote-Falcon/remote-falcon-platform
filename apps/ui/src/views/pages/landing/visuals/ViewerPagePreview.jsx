/**
 * <ViewerPagePreview />
 *
 * Decorative preview for the "A viewer page you actually own" feature.
 * Renders a stylized code-editor window — window chrome, line-numbered
 * HTML/CSS source, an inline validation chip, and a subdomain pill
 * along the bottom — so the visual reads as "build the page yourself".
 */

import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { IconCheck, IconLock } from '@tabler/icons-react';

// Tokenized "syntax" colors derived from the v2 palette so the editor
// reads as on-brand instead of generic VS Code.
const SYNTAX = (theme) => ({
  bracket:  theme.palette.text.secondary,
  tag:      theme.palette.primary.main,
  attr:     alpha(theme.palette.text.muted ?? theme.palette.text.secondary, 0.95),
  string:   theme.palette.secondary.main,
  comment:  alpha(theme.palette.text.secondary, 0.7),
  prop:     '#7fc8a5',
  value:    '#f0a78b',
  text:     theme.palette.text.primary
});

// ---------- Mini token pieces (one per "syntax kind") --------------------
// Each token is a span of inline text. We compose code lines from arrays.

const Tok = ({ kind, children }) => (
  <Box
    component="span"
    sx={{
      color: (theme) => SYNTAX(theme)[kind] ?? theme.palette.text.primary,
      fontStyle: kind === 'comment' ? 'italic' : 'normal'
    }}
  >
    {children}
  </Box>
);
Tok.propTypes = {
  kind: PropTypes.oneOf(['bracket', 'tag', 'attr', 'string', 'comment', 'prop', 'value', 'text']).isRequired,
  children: PropTypes.node
};

// Convenience builders
const t = (kind) => (children) => <Tok kind={kind}>{children}</Tok>;
const bracket = t('bracket');
const tag     = t('tag');
const attr    = t('attr');
const str     = t('string');
const prop    = t('prop');
const val     = t('value');
const text    = t('text');
const cmt     = t('comment');

const LINES = [
  // [content, indent]
  // Easter egg: a "ho ho ho" comment greets anyone who reads the source.
  [<>{cmt('<!-- ho ho ho -->')}</>, 0],
  [<>{bracket('<')}{tag('header')} {attr('class')}{bracket('=')}{str('"hero"')}{bracket('>')}</>, 0],
  [<>{bracket('<')}{tag('h1')}{bracket('>')}{text('Pine Lights')}{bracket('</')}{tag('h1')}{bracket('>')}</>, 1],
  [<>{bracket('<')}{tag('p')}{bracket('>')}{text('Sundown — 11 PM')}{bracket('</')}{tag('p')}{bracket('>')}</>, 1],
  [<>{bracket('</')}{tag('header')}{bracket('>')}</>, 0],
  [<>{' '}</>, 0],
  [<>{bracket('<')}{tag('button')} {attr('class')}{bracket('=')}{str('"btn"')}{bracket('>')}</>, 0],
  [<>{text('Request a song')}</>, 1],
  [<>{bracket('</')}{tag('button')}{bracket('>')}</>, 0],
  [<>{' '}</>, 0],
  [<>{bracket('<')}{tag('style')}{bracket('>')}</>, 0],
  // Easter egg: 91.7 FM is the broadcast frequency many real RF show
  // owners use to sync their light-show audio. Plausible CSS comment,
  // real-world community reference.
  [<>{cmt('/* tune to 91.7 FM */')}</>, 1],
  [<>{prop('.hero')} {bracket('{')} {prop('background')}{bracket(':')} {val('#0e3a66')}{bracket(';')} {bracket('}')}</>, 1],
  [<>{prop('.btn')} {bracket('{')} {prop('color')}{bracket(':')} {val('#f4b860')}{bracket(';')} {bracket('}')}</>, 1],
  [<>{bracket('</')}{tag('style')}{bracket('>')}</>, 0]
];

// ---------- Editor frame -------------------------------------------------

const Dot = ({ color }) => (
  <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
);
Dot.propTypes = { color: PropTypes.string.isRequired };

const ViewerPagePreview = () => (
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
          theme.palette.mode === 'dark' ? alpha('#0a0e16', 0.92) : alpha('#f6f7fb', 1),
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: (t) => t.customShadows?.elevated ?? t.shadows[6]
      }}
    >
      {/* Window chrome */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 1.25,
          py: 0.85,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? alpha('#06090f', 0.7) : alpha('#ebedf2', 1)
        }}
      >
        <Stack direction="row" spacing={0.6}>
          <Dot color="#ff5f57" />
          <Dot color="#febc2e" />
          <Dot color="#28c840" />
        </Stack>
        <Box sx={{ flexGrow: 1 }} />
        <Typography
          sx={{
            fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
            fontSize: 9.5,
            color: 'text.secondary',
            fontWeight: 500
          }}
        >
          index.html
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.4}
          sx={{
            px: 0.7,
            py: 0.2,
            borderRadius: '999px',
            bgcolor: (theme) => alpha(theme.palette.success.main, 0.16),
            border: (theme) => `1px solid ${alpha(theme.palette.success.main, 0.4)}`,
            color: 'success.main'
          }}
        >
          <IconCheck size={10} stroke={3} />
          <Typography sx={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em' }}>
            VALID
          </Typography>
        </Stack>
      </Stack>

      {/* Editor body */}
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
          fontSize: 10.5,
          lineHeight: 1.55,
          py: 1
        }}
      >
        {/* Line numbers */}
        <Box
          sx={{
            px: 1,
            color: (theme) => alpha(theme.palette.text.secondary, 0.55),
            textAlign: 'right',
            userSelect: 'none',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 9.5,
            borderRight: '1px solid',
            borderColor: 'divider',
            minWidth: 24
          }}
        >
          {LINES.map((_, i) => (
            <Box key={i}>{i + 1}</Box>
          ))}
        </Box>
        {/* Source */}
        <Box
          sx={{
            flex: 1,
            pl: 1.25,
            pr: 1,
            overflow: 'hidden',
            whiteSpace: 'nowrap'
          }}
        >
          {LINES.map(([content, indent], i) => (
            <Box key={i} sx={{ pl: `${indent * 12}px` }}>
              {content}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Subdomain footer */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.6}
        sx={{
          px: 1.25,
          py: 0.7,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? alpha('#06090f', 0.7) : alpha('#ebedf2', 1)
        }}
      >
        <IconLock size={10} stroke={2} />
        <Typography
          sx={{
            fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
            fontSize: 9.5,
            color: 'text.secondary',
            letterSpacing: '0.01em'
          }}
        >
          <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
            pinelights
          </Box>
          .remotefalcon.com
        </Typography>
      </Stack>
    </Box>
  </Box>
);

export default ViewerPagePreview;
