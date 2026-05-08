import { Box } from '@mui/material';

import AuthRegister from './auth-forms/AuthRegister';
import AuthShell, { AuthFormSwitch } from './AuthShell';

const Register = () => (
  <AuthShell
    eyebrow="Create your show"
    heading="Let's get the lights on."
    subhead="Sign up and start taking song requests in minutes."
    tagline={
      <>
        Bring your show{' '}
        <Box component="span" sx={{ color: 'primary.main' }}>
          online
        </Box>{' '}
        in under a minute.
      </>
    }
  >
    <AuthRegister />
    <AuthFormSwitch prompt="Already have an account?" label="Sign in" to="/signin" />
  </AuthShell>
);

export default Register;
