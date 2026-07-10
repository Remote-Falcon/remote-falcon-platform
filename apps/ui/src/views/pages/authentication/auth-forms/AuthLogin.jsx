import { useState } from 'react';

import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  Typography,
  CircularProgress
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Formik } from 'formik';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import * as Yup from 'yup';

import useAuth from '../../../../hooks/useAuth';
import AnimateButton from '../../../../ui-component/extended/AnimateButton';

const JWTLogin = ({ ...others }) => {
  const theme = useTheme();

  const { login, mfaChallenge, verifyMfa, cancelMfaChallenge } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleMouseDownPassword = (event) => {
    event.preventDefault();
  };

  const submitMfaCode = async (event) => {
    event.preventDefault();
    if (!mfaCode.trim() || isVerifyingMfa) {
      return;
    }
    setIsVerifyingMfa(true);
    await verifyMfa(mfaCode.trim());
    setIsVerifyingMfa(false);
  };

  const backToSignIn = () => {
    setMfaCode('');
    setUseRecoveryCode(false);
    cancelMfaChallenge();
  };

  // Two-phase sign-in: while an MFA challenge is pending the code step
  // renders in place of the email/password form (same route, so the
  // GuestGuard redirect only fires once verifyMfa flips isLoggedIn).
  if (mfaChallenge) {
    return (
      <form noValidate onSubmit={submitMfaCode} {...others}>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {useRecoveryCode
            ? 'Enter one of your recovery codes.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </Typography>
        <FormControl fullWidth sx={{ ...theme.typography.customInput, mt: 0, mb: 2.5 }}>
          <InputLabel htmlFor="outlined-adornment-mfa-code">{useRecoveryCode ? 'Recovery Code' : 'Authentication Code'}</InputLabel>
          <OutlinedInput
            id="outlined-adornment-mfa-code"
            type="text"
            value={mfaCode}
            name="mfaCode"
            label={useRecoveryCode ? 'Recovery Code' : 'Authentication Code'}
            autoFocus
            onChange={(e) => setMfaCode(e?.target?.value)}
            inputProps={
              useRecoveryCode
                ? { autoComplete: 'off', placeholder: 'XXXXX-XXXXX' }
                : { autoComplete: 'one-time-code', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 }
            }
          />
        </FormControl>
        <Grid container alignItems="center" justifyContent="space-between">
          <Grid item>
            <Typography
              variant="subtitle1"
              color="secondary"
              onClick={() => {
                setMfaCode('');
                setUseRecoveryCode(!useRecoveryCode);
              }}
              sx={{ textDecoration: 'none', cursor: 'pointer' }}
            >
              {useRecoveryCode ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
            </Typography>
          </Grid>
          <Grid item>
            <Typography
              variant="subtitle1"
              color="secondary"
              onClick={backToSignIn}
              sx={{ textDecoration: 'none', cursor: 'pointer' }}
            >
              Back to sign in
            </Typography>
          </Grid>
        </Grid>
        <Box sx={{ mt: 2 }}>
          {isVerifyingMfa ? (
            <Grid item xs={12}>
              <Grid item container direction="column" alignItems="center" xs={12}>
                <CircularProgress color="secondary" />
              </Grid>
            </Grid>
          ) : (
            <AnimateButton>
              <Button color="secondary" disabled={!mfaCode.trim()} fullWidth size="large" type="submit" variant="contained">
                Verify
              </Button>
            </AnimateButton>
          )}
        </Box>
      </form>
    );
  }

  return (
    <Formik
      initialValues={{
        email: '',
        password: '',
        submit: null
      }}
      validationSchema={Yup.object().shape({
        email: Yup.string().test('is-demo', 'Must be a valid email', (value) => {
          return value === 'demo' || Yup.string().email().isValidSync(value);
        })
        .max(255)
        .required("Email is required"),
        password: Yup.string().max(255).required('Password is required')
      })}
      onSubmit={async (values) => {
        await login(values.email, values.password);
      }}
    >
      {({ errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values }) => (
        <form noValidate onSubmit={handleSubmit} {...others}>
          <FormControl fullWidth error={Boolean(touched.email && errors.email)} sx={{ ...theme.typography.customInput, mt: 0, mb: 2.5 }}>
            <InputLabel htmlFor="outlined-adornment-email-login">Email Address</InputLabel>
            <OutlinedInput
              id="outlined-adornment-email-login"
              type="email"
              value={values.email}
              name="email"
              label="Email Address"
              onBlur={handleBlur}
              onChange={handleChange}
              inputProps={{}}
            />
            {touched.email && errors.email && (
              <FormHelperText error id="standard-weight-helper-text-email-login">
                {errors.email}
              </FormHelperText>
            )}
          </FormControl>

          <FormControl fullWidth error={Boolean(touched.password && errors.password)} sx={{ ...theme.typography.customInput, mt: 0, mb: 2.5 }}>
            <InputLabel htmlFor="outlined-adornment-password-login">Password</InputLabel>
            <OutlinedInput
              id="outlined-adornment-password-login"
              type={showPassword ? 'text' : 'password'}
              value={values.password}
              name="password"
              onBlur={handleBlur}
              onChange={handleChange}
              endAdornment={
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={handleClickShowPassword}
                    onMouseDown={handleMouseDownPassword}
                    edge="end"
                    size="large"
                  >
                    {showPassword ? <Visibility /> : <VisibilityOff />}
                  </IconButton>
                </InputAdornment>
              }
              inputProps={{}}
              label="Password"
            />
            {touched.password && errors.password && (
              <FormHelperText error id="standard-weight-helper-text-password-login">
                {errors.password}
              </FormHelperText>
            )}
          </FormControl>

          <Grid container alignItems="center" justifyContent="space-between">
            <Grid item>
              <Typography variant="subtitle1" component={Link} to="/forgot" color="secondary" sx={{ textDecoration: 'none' }}>
                Forgot Password?
              </Typography>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            {isSubmitting ? (
              <Grid item xs={12}>
                <Grid item container direction="column" alignItems="center" xs={12}>
                  <CircularProgress color="secondary" />
                </Grid>
              </Grid>
            ) : (
              <AnimateButton>
                <Button color="secondary" disabled={isSubmitting} fullWidth size="large" type="submit" variant="contained">
                  Sign In
                </Button>
              </AnimateButton>
            )}
          </Box>
        </form>
      )}
    </Formik>
  );
};

JWTLogin.propTypes = {
  loginProp: PropTypes.number
};

export default JWTLogin;
