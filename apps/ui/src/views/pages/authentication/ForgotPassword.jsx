import { Box } from '@mui/material';

import AuthForgotPassword from './auth-forms/AuthForgotPassword';
import AuthShell, { AuthFormSwitch } from './AuthShell';

const ForgotPassword = () => (
  <AuthShell
    eyebrow="Password reset"
    heading="Forgot your password?"
    subhead="Yeah, it happens. Enter your email below and we'll send you a link to set a new one."
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
    <AuthForgotPassword />
    <AuthFormSwitch prompt="Need to sign up first?" label="Sign up" to="/signup" />
  </AuthShell>
);

export default ForgotPassword;
