import { Buffer } from 'buffer';

import { createContext, useEffect } from 'react';
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
import { SIGN_UP, VERIFY_EMAIL, FORGOT_PASSWORD, RESET_PASSWORD } from '../utils/graphql/controlPanel/mutations';
import { SIGN_IN, GET_SHOW } from '../utils/graphql/controlPanel/queries';
import { trackPosthogEvent } from '../utils/analytics/posthog';
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
    localStorage.setItem('serviceToken', serviceToken);
    setGraphqlHeaders(serviceToken);
    axios.defaults.headers.common.Authorization = `Bearer ${serviceToken}`;
  } else {
    localStorage.removeItem('serviceToken');
    setGraphqlHeaders(null);
    delete axios.defaults.headers.common.Authorization;
  }

  const isImpersonating = localStorage.getItem('isImpersonating');
  if(isImpersonating) {
    const impersonationServiceToken = window.localStorage.getItem('impersonationServiceToken');
    setImpersonationSession(impersonationServiceToken);
  }
};

export const setImpersonationSession = (serviceToken) => {
  if (serviceToken) {
    localStorage.setItem('impersonationServiceToken', serviceToken);
    setGraphqlHeaders(serviceToken);
    axios.defaults.headers.common.Authorization = `Bearer ${serviceToken}`;
  }
}

export const clearImpersonationSession = () => {
  localStorage.removeItem('impersonationServiceToken');
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
  const [getShowQuery] = useLazyQuery(GET_SHOW, {
    fetchPolicy: 'network-only'
  });

  const logout = () => {
    client.clearStore();
    setSession(null);
    // Clear PostHog identity on logout to avoid cross-user leakage
    try {
      posthog?.reset?.();
    } catch (_) {}
    dispatch(startLogoutAction());
  };

  useEffect(() => {
    const init = () => {
      try {
        const serviceToken = window.localStorage.getItem('serviceToken');
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
              // Identify this user/show in PostHog using the showSubdomain
              // as distinct_id. Intentionally NOT sending email — PII to a
              // third-party analytics provider, regulated (GDPR/CCPA), and
              // not needed for analytics (showSubdomain is the user key).
              try {
                if (posthog && showData?.showSubdomain) {
                  posthog.identify(showData.showSubdomain, {
                    showName: showData?.showName,
                    showRole: showData?.showRole
                  });
                }
              } catch (_) {}
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

  const login = async (email, password) => {
    await signInQuery({
      context: {
        headers: {
          authorization: `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}`,
          Route: 'Control-Panel'
        }
      },
      onCompleted: (data) => {
        setSession(data?.signIn?.serviceToken);
        const showData = { ...data?.signIn };
        showData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        dispatch(
          startLoginAction({
            ...showData
          })
        );
        // See identify() note above — no email to PostHog.
        try {
          if (posthog && showData?.showSubdomain) {
            posthog.identify(showData.showSubdomain, {
              showName: showData?.showName,
              showRole: showData?.showRole
            });
          }
        } catch (_) {}
        trackPosthogEvent('signin', {
          show_name: showData?.showName,
          show_role: showData?.showRole
        });
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

  const register = async (showName, email, password, firstName, lastName) => {
    await signUpMutation({
      variables: {
        showName,
        firstName,
        lastName
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
        resetPassword
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
