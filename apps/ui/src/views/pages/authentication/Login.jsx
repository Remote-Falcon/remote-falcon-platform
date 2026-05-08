import { Box } from '@mui/material';

import AuthLogin from './auth-forms/AuthLogin';
import AuthShell, { AuthFormSwitch } from './AuthShell';

const Login = () => (
  <AuthShell
    eyebrow="Sign in"
    heading="So glad you came back!"
    subhead="Sign in to manage your show, sequences, and viewer page."
    tagline={
      <>
        Let your viewers take{' '}
        <Box component="span" sx={{ color: 'primary.main' }}>
          control.
        </Box>
      </>
    }
  >
    <AuthLogin />
    <AuthFormSwitch prompt="Don't have an account?" label="Sign up" to="/signup" />
  </AuthShell>
);

export default Login;
