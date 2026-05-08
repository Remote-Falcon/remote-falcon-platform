import { Box, Chip, Container, Grid, Link, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';

import Logo from '../../../design-system/components/Logo';
import { VERSION } from '../../../config';

const FOOTER_COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Documentation', href: 'https://docs.remotefalcon.com', external: true },
      { label: 'Sign up', href: '/signup' },
      { label: 'Sign in', href: '/signin' }
    ]
  },
  {
    title: 'Community',
    links: [
      { label: 'Facebook group', href: 'https://www.facebook.com/groups/remotefalcon', external: true },
      { label: 'GitHub', href: 'https://github.com/Remote-Falcon', external: true }
    ]
  },
  {
    title: 'Support',
    links: [
      { label: 'Patreon', href: 'https://www.patreon.com/cw/MattShorts', external: true },
      { label: 'Ko-fi', href: 'https://ko-fi.com/mattshorts', external: true },
      { label: 'Buy Me a Coffee', href: 'https://buymeacoffee.com/mattshorts', external: true }
    ]
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy-policy' },
      { label: 'Terms of service', href: '/terms-and-conditions' }
    ]
  }
];

const FooterLink = ({ link }) => {
  const linkProps = link.external
    ? { href: link.href, target: '_blank', rel: 'noopener' }
    : { component: RouterLink, to: link.href };
  return (
    <Link
      {...linkProps}
      underline="none"
      sx={{
        color: 'text.secondary',
        fontSize: 14,
        transition: (t) => t.transitions.create('color', { duration: t.transitions.duration.shortest }),
        '&:hover': { color: 'text.primary' }
      }}
    >
      {link.label}
    </Link>
  );
};

const FooterPage = () => (
  <Box
    component="footer"
    sx={{
      borderTop: '1px solid',
      borderColor: 'divider',
      pt: { xs: 6, md: 8 },
      pb: 4,
      // Subtle gradient toward black/near-black so the footer reads as
      // a "cool down" zone after the body. Works in both themes.
      background: (theme) =>
        theme.palette.mode === 'dark'
          ? `linear-gradient(180deg, ${theme.palette.background.default}, ${alpha('#000000', 0.45)})`
          : `linear-gradient(180deg, ${theme.palette.background.default}, ${theme.palette.grey[100]})`
    }}
  >
    <Container>
      <Grid container spacing={{ xs: 4, md: 6 }}>
        {/* Brand + blurb */}
        <Grid item xs={12} md={5}>
          <RouterLink to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Logo variant="lockup" markSize={56} wordmarkSize={20} />
          </RouterLink>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 2.5, maxWidth: '38ch', lineHeight: 1.6 }}
          >
            Open-source software that lets your viewers take control of your light show.
            Built by show owners, for show owners.
          </Typography>
        </Grid>

        {/* Link columns — nested grid in the remaining 7 cols on desktop */}
        <Grid item xs={12} md={7}>
          <Grid container spacing={{ xs: 4, sm: 4 }}>
            {FOOTER_COLS.map((col) => (
              <Grid item xs={6} sm={6} md={3} key={col.title}>
                <Typography
                  sx={{
                    color: 'text.secondary',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    mb: 2
                  }}
                >
                  {col.title}
                </Typography>
                <Stack spacing={1.25}>
                  {col.links.map((l) => (
                    <FooterLink key={l.label} link={l} />
                  ))}
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>

      {/* Bottom strip: copyright + version chip */}
      <Box
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          mt: { xs: 5, md: 7 },
          pt: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13 }}>
          © {new Date().getFullYear()} Remote Falcon
        </Typography>
        <Chip
          label={`v${VERSION}`}
          size="small"
          sx={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 11,
            color: 'text.secondary',
            bgcolor: 'transparent',
            border: '1px solid',
            borderColor: 'divider',
            height: 22,
            '& .MuiChip-label': { px: 1.25 }
          }}
        />
      </Box>
    </Container>
  </Box>
);

export default FooterPage;
