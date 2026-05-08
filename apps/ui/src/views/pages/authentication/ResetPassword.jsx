import { Box } from '@mui/material';

import AuthResetPassword from './auth-forms/AuthResetPassword';
import AuthShell from './AuthShell';

const ResetPassword = () => (
  <AuthShell
    eyebrow="New password"
    heading="Enter your new password."
    subhead="And maybe write it down this time."
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
    <AuthResetPassword />
  </AuthShell>
);

export default ResetPassword;
