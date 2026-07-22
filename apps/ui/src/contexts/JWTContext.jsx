import { Buffer } from 'buffer';

import { createContext, useEffect, useState } from 'react';
import { usePostHog } from 'posthog-js/react';

import { useLazyQuery, useMutation, useApolloClient } from '@apollo/client';
import jwtDecode from 'jwt-decode';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

import { setGraphqlHeaders } from '../index';
import { useDispatch, useSelector } from '../store';
import { startLoginAction, startLogoutAction } from '../store/slices/show';
import Loader from '../ui-component/Loader';
import axios from '../utils/axios';
import { StatusResponse } from '../utils/enum';
import safeStorage from '../utils/safeStorage';
import { SIGN_UP, VERIFY_EMAIL, FORGOT_PASSWORD, RESET_PASSWORD } from '../utils/graphql/controlPanel/mutations';
import { SIGN_IN, GET_SHOW, VERIFY_MFA } from '../utils/graphql/controlPanel/queries';
import { isImpersonationSession, trackPosthogEvent } from '../utils/analytics/posthog';
import { showAlert } from '../views/pages/globalPageHelpers';

const verifyToken = (serviceToken) => {
  if (!serviceToken) {
    return false;
  }
  const decoded = jwtDecode(serviceToken);
  return decoded.exp > Date.now() / 1000;
};

export const setSession = (serviceToken) => {
  if (serviceToken) {
    safeStorage.setItem('serviceToken', serviceToken);
    setGraphqlHeaders(serviceToken);
    axios.defaults.headers.common.Authorization = `Bearer ${serviceToken}`;
  } else {
    safeStorage.removeItem('serviceToken');
    setGraphqlHeaders(null);
    delete axios.defaults.headers.common.Authorization;
  }

  const isImpersonating = safeStorage.getItem('isImpersonating');
  if(isImpersonating) {
    const impersonationServiceToken = safeStorage.getItem('impersonationServiceToken');
    setImpersonationSession(impersonationServiceToken);
  }
};

export const setImpersonationSession = (serviceToken) => {
  if (serviceToken) {
    safeStorage.setItem('impersonationServiceToken', serviceToken);
    setGraphqlHeaders(serviceToken);
    axios.defaults.headers.common.Authorization = `Bearer ${serviceToken}`;
  }
}

export const clearImpersonationSession = () => {
  safeStorage.removeItem('impersonationServiceToken');
}

const JWTContext = createContext(null);

export const JWTProvider = ({ children }) => {
  const dispatch = useDispatch();
  const { ...showState } = useSelector((state) => state.show);

  const navigate = useNavigate();

  const client = useApolloClient();

  // PostHog instance (available because PostHogProvider wraps the app in index.jsx)
  const posthog = usePostHog?.();

  const [signUpMutation] = useMutation(SIGN_UP);
  const [verifyEmailMutation] = useMutation(VERIFY_EMAIL);
  const [forgotPasswordMutation] = useMutation(FORGOT_PASSWORD);
  const [resetPasswordMutation] = useMutation(RESET_PASSWORD);

  const [signInQuery] = useLazyQuery(SIGN_IN, {
    fetchPolicy: 'network-only'
  });
  const [verifyMfaQuery] = useLazyQuery(VERIFY_MFA, {
    fetchPolicy: 'network-only'
  });
  const [getShowQuery] = useLazyQuery(GET_SHOW, {
    fetchPolicy: 'network-only'
  });

  // MFA-pending token from a signIn against a 2FA-enabled account. Held in
  // React state ONLY — it must never reach localStorage or setSession; it is
  // solely valid for the verifyMfa query and expires in ~5 minutes.
  const [mfaChallenge, setMfaChallenge] = useState(null);

  const logout = () => {
    client.clearStore();
    setSession(null);
    // Clear PostHog identity on logout to avoid cross-user leakage
    try {
      posthog?.reset?.();
    } catch (_) {}
    dispatch(startLogoutAction());
  };

  // Identify this user/show in PostHog using the showSubdomain as
  // distinct_id. Email is PII to a third-party analytics provider
  // (GDPR/CCPA) — strict consent model (a), PRD-013 P0-2: it is sent
  // ONLY while marketingOptIn is true. Consent is tri-state on the
  // person too: true syncs email, false is stamped WITHOUT email, and
  // null (never asked) is omitted entirely so legacy shows stay
  // distinguishable from explicit declines in PostHog audiences.
  // lastLoginDate is always set: it's the recency anchor for
  // dormant-user (re-engagement) audiences — PostHog batch audiences
  // can't express behavioral "no event in N months", so they filter on
  // this person property instead. Stamped client-side at identify time,
  // which coincides with the backend's own lastLoginDate refresh.
  //
  // Opt-out scrubbing deliberately does NOT happen here: it fires once
  // at the actual opt-out transition (applyEmailConsent in the Account
  // Settings toggle) and server-side in the mutation (PostHogUtil).
  // A per-login scrub would emit a no-op event on every page load for
  // every opted-out show, forever.
  const identifyShow = (showData) => {
    try {
      if (!posthog || !showData?.showSubdomain) return;
      // Impersonation sessions must never touch the target's person
      // record: identify() here would stamp their lastLoginDate (breaking
      // dormant-audience recency), merge the admin's device into their
      // person, and pull their email into the admin's session.
      if (isImpersonationSession()) return;
      const { marketingOptIn, email, showName, showRole, showSubdomain } = showData;
      const props = {
        showName,
        showRole,
        lastLoginDate: new Date().toISOString()
      };
      if (marketingOptIn === true) {
        props.marketingOptIn = true;
        if (email) props.email = email;
      } else if (marketingOptIn === false) {
        props.marketingOptIn = false;
      }
      posthog.identify(showSubdomain, props);
    } catch (_) {}
  };

  useEffect(() => {
    const init = () => {
      try {
        const serviceToken = safeStorage.getItem('serviceToken');
        if (serviceToken && verifyToken(serviceToken)) {
          setSession(serviceToken);
          getShowQuery({
            context: {
              headers: {
                Route: 'Control-Panel'
              }
            },
            onCompleted: (data) => {
              const showData = { ...data?.getShow };
              showData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
              dispatch(
                startLoginAction({
                  ...showData
                })
              );
              // See identifyShow above — consent-scoped PII posture.
              identifyShow(showData);
            },
            onError: () => {
              logout();
            }
          });
        } else {
          logout();
        }
      } catch (err) {
        // Token verify / show fetch failed during boot — users land back
        // on login with no other signal. Surface to ops so silent bounces
        // are debuggable.
        trackPosthogEvent('session_init_failed', { message: err?.message });
        logout();
      }
    };

    init();
  }, [dispatch]);

  const completeSignIn = (show) => {
    setSession(show?.serviceToken);
    const showData = { ...show };
    showData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    dispatch(
      startLoginAction({
        ...showData
      })
    );
    // See identifyShow above — consent-scoped PII posture.
    identifyShow(showData);
    trackPosthogEvent('signin', {
      show_name: showData?.showName,
      show_role: showData?.showRole
    });
  };

  const login = async (email, password) => {
    await signInQuery({
      context: {
        headers: {
          authorization: `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`,
          Route: 'Control-Panel'
        }
      },
      onCompleted: (data) => {
        if (data?.signIn?.mfaEnabled === true) {
          // Stub Show: serviceToken is the 5-minute MFA-pending token. Do
          // NOT setSession or flip isLoggedIn — the challenge step renders
          // in place of the password form until verifyMfa succeeds.
          setMfaChallenge(data?.signIn?.serviceToken);
          return;
        }
        completeSignIn(data?.signIn);
      },
      onError: (error) => {
        if (error?.message === StatusResponse.UNAUTHORIZED) {
          showAlert(dispatch, { message: 'Invalid Credentials', alert: 'warning' });
        } else if (error?.message === StatusResponse.SHOW_NOT_FOUND) {
          showAlert(dispatch, { message: 'Show could not be found!', alert: 'error' });
        } else if (error?.message === StatusResponse.EMAIL_NOT_VERIFIED) {
          showAlert(dispatch, { message: 'Email has not been verified', alert: 'warning' });
        } else {
          showAlert(dispatch, { alert: 'error' });
        }
      }
    });
  };

  const verifyMfa = async (code) => {
    await verifyMfaQuery({
      context: {
        headers: {
          authorization: `Bearer ${mfaChallenge}`,
          Route: 'Control-Panel'
        }
      },
      variables: {
        code
      },
      onCompleted: (data) => {
        setMfaChallenge(null);
        completeSignIn(data?.verifyMfa);
      },
      onError: (error) => {
        if (error?.message === StatusResponse.INVALID_MFA_CODE) {
          showAlert(dispatch, { message: 'Invalid code, try again', alert: 'warning' });
        } else if (error?.message === StatusResponse.MFA_RATE_LIMITED) {
          showAlert(dispatch, { message: 'Too many attempts — wait 15 minutes and try again', alert: 'warning' });
        } else if (error?.message === StatusResponse.MFA_CHALLENGE_EXPIRED) {
          setMfaChallenge(null);
          showAlert(dispatch, { message: 'Sign-in expired, enter your password again', alert: 'warning' });
        } else {
          showAlert(dispatch, { alert: 'error' });
        }
      }
    });
  };

  const cancelMfaChallenge = () => {
    setMfaChallenge(null);
  };

  const register = async (showName, email, password, firstName, lastName, marketingOptIn) => {
    await signUpMutation({
      variables: {
        showName,
        firstName,
        lastName,
        // PRD-013 P0-4 — consent from the signup checkbox. Passed through
        // untouched: true/false are real decisions, null means the
        // checkbox never rendered (self-host) and the server preserves
        // null as "never asked".
        marketingOptIn
      },
      context: {
        headers: {
          authorization: `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`,
          Route: 'Control-Panel'
        }
      },
      onCompleted: () => {
        trackPosthogEvent('sign_up', {
          show_name: showName
        });
        showAlert(dispatch, { id: 'snackbar-sign-up', message: `A verification email has been sent to ${email}` });
        setTimeout(() => {
          navigate('/signin', { replace: true });
        }, 3000);
      },
      onError: (error) => {
        if (error?.message === StatusResponse.SHOW_EXISTS) {
          showAlert(dispatch, { id: 'snackbar-sign-up', message: 'That email or show name already exists', alert: 'error' });
        } else if (error?.message === StatusResponse.EMAIL_CANNOT_BE_SENT) {
          showAlert(dispatch, { id: 'snackbar-sign-up', message: 'Unable to send verification email', alert: 'error' });
        } else {
          showAlert(dispatch, { alert: 'error' });
        }
      }
    });
  };

  const verifyEmail = async (showToken) => {
    await verifyEmailMutation({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      variables: {
        showToken
      },
      onCompleted: () => {
        trackPosthogEvent('email_verified');
        showAlert(dispatch, { message: 'Email successfully verified' });
        setTimeout(() => {
          navigate('/signin', { replace: true });
        }, 3000);
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    });
  };

  const sendResetPassword = async (email) => {
    await forgotPasswordMutation({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      variables: {
        email
      },
      onCompleted: () => {
        showAlert(dispatch, { message: `Forgot password email sent to ${email}` });
        setTimeout(() => {
          navigate('/signin', { replace: true });
        }, 3000);
      },
      onError: (error) => {
        if (error?.message === StatusResponse.UNAUTHORIZED) {
          showAlert(dispatch, { alert: 'error' });
        } else if (error?.message === StatusResponse.EMAIL_CANNOT_BE_SENT) {
          showAlert(dispatch, { message: 'Unable to send password reset email', alert: 'error' });
        } else {
          showAlert(dispatch, { alert: 'error' });
        }
      }
    });
  };

  const resetPassword = async (serviceToken, password) => {
    await resetPasswordMutation({
      context: {
        headers: {
          authorization: `Bearer ${serviceToken}`,
          Password: password,
          Route: 'Control-Panel'
        }
      },
      onCompleted: () => {
        showAlert(dispatch, { message: 'Password Reset' });
        setTimeout(() => {
          navigate('/signin', { replace: true });
        }, 3000);
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    });
  };

  if (showState.isInitialized !== undefined && !showState.isInitialized) {
    return <Loader />;
  }

  return (
    <JWTContext.Provider
      value={{
        ...showState,
        login,
        logout,
        verifyEmail,
        register,
        sendResetPassword,
        resetPassword,
        mfaChallenge,
        verifyMfa,
        cancelMfaChallenge
      }}
    >
      {children}
    </JWTContext.Provider>
  );
};

JWTProvider.propTypes = {
  children: PropTypes.node
};

export default JWTContext;
