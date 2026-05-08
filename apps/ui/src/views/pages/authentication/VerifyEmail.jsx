import { useEffect, useState } from 'react';

import { Box, Button } from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';

import useAuth from '../../../hooks/useAuth';
import AuthShell from './AuthShell';

const STATUS = {
  verifying: {
    eyebrow: 'Email verification',
    heading: 'Verifying your email…',
    subhead: 'This will only take a moment.'
  },
  verified: {
    eyebrow: 'Email verified',
    heading: "You're all set.",
    subhead: 'Sign in and get the show running.'
  },
  error: {
    eyebrow: 'Email verification',
    heading: "Hmm, that didn't work.",
    subhead: 'The link may have expired. Try signing in — if your email is still unverified, you can request a new link from there.'
  }
};

const VerifyEmail = () => {
  const { verifyEmail } = useAuth();
  const { showToken } = useParams();
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await verifyEmail(showToken);
        if (!cancelled) setStatus('verified');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToken, verifyEmail]);

  const copy = STATUS[status];

  return (
    <AuthShell
      eyebrow={copy.eyebrow}
      heading={copy.heading}
      subhead={copy.subhead}
      tagline={
        <>
          Let your viewers take{' '}
          <Box component="span" sx={{ color: 'primary.main' }}>
            control.
          </Box>
        </>
      }
      meta="Open source · Community-built"
    >
      {(status === 'verified' || status === 'error') && (
        <Button
          component={RouterLink}
          to="/signin"
          variant="contained"
          color="secondary"
          size="large"
          fullWidth
          sx={{ mt: 1 }}
        >
          Sign in &rarr;
        </Button>
      )}
    </AuthShell>
  );
};

export default VerifyEmail;
