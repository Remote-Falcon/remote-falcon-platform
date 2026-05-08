import React, { lazy } from 'react';

import MinimalLayout from '../layout/MinimalLayout';
import NavMotion from '../layout/NavMotion';
import Loadable from '../ui-component/Loadable';
import GuestGuard from '../utils/route-guard/GuestGuard';

const Landing = Loadable(lazy(() => import('../views/pages/landing')));
const NotFound = Loadable(lazy(() => import('../views/pages/NotFound')));
const AuthLogin = Loadable(lazy(() => import('../views/pages/authentication/Login')));
const AuthRegister = Loadable(lazy(() => import('../views/pages/authentication/Register')));
const AuthForgotPassword = Loadable(lazy(() => import('../views/pages/authentication/ForgotPassword')));
const VerifyEmail = Loadable(lazy(() => import('../views/pages/authentication/VerifyEmail')));
const ResetPassword = Loadable(lazy(() => import('../views/pages/authentication/ResetPassword')));
const PrivacyPolicy = Loadable(lazy(() => import('../views/pages/misc/PrivacyPolicy')));
const TermsAndConditions = Loadable(lazy(() => import('../views/pages/misc/TermsAndConditions')));

const LoginRoutes = {
  path: '/',
  element: (
    <NavMotion>
      <GuestGuard>
        <MinimalLayout />
      </GuestGuard>
    </NavMotion>
  ),
  children: [
    {
      path: '/',
      element: <Landing />
    },
    {
      path: '/404',
      element: <NotFound />
    },
    {
      path: '/signin',
      element: <AuthLogin />
    },
    {
      path: '/signup',
      element: <AuthRegister />
    },
    {
      path: '/verifyEmail/:showToken/:showSubdomain',
      element: <VerifyEmail />
    },
    {
      path: '/forgot',
      element: <AuthForgotPassword />
    },
    {
      path: '/resetPassword/:passwordResetLink',
      element: <ResetPassword />
    },
    {
      path: '/privacy-policy',
      element: <PrivacyPolicy />
    },
    {
      path: '/terms-and-conditions',
      element: <TermsAndConditions />
    }
  ]
};

export default LoginRoutes;
