import React, { lazy } from 'react';

import { Navigate } from 'react-router-dom';

import MainLayout from '../layout/MainLayout';
import Loadable from '../ui-component/Loadable';
import AuthGuard from '../utils/route-guard/AuthGuard';

const Landing = Loadable(lazy(() => import('../views/pages/landing')));
const Dashboard = Loadable(lazy(() => import('../views/pages/controlPanel/dashboard')));

const ViewerSettings = Loadable(lazy(() => import('../views/pages/controlPanel/viewerSettings')));
const MainSettings = Loadable(lazy(() => import('../views/pages/controlPanel/viewerSettings/MainSettings')));
const ViewerPageSettings = Loadable(lazy(() => import('../views/pages/controlPanel/viewerSettings/ViewerPageSettings')));
const JukeboxSettings = Loadable(lazy(() => import('../views/pages/controlPanel/viewerSettings/JukeboxSettings')));
const VotingSettings = Loadable(lazy(() => import('../views/pages/controlPanel/viewerSettings/VotingSettings')));
const InteractionSettings = Loadable(lazy(() => import('../views/pages/controlPanel/viewerSettings/InteractionSettings')));

const ViewerPage = Loadable(lazy(() => import('../views/pages/controlPanel/viewerPage')));
const Sequences = Loadable(lazy(() => import('../views/pages/controlPanel/sequences')));
const SequencesList = Loadable(lazy(() => import('../views/pages/controlPanel/sequences/SequencesList')));
const SequenceGroups = Loadable(lazy(() => import('../views/pages/controlPanel/sequences/SequenceGroups')));

const Analytics = Loadable(lazy(() => import('../views/pages/controlPanel/analytics')));
const AnalyticsOverview = Loadable(lazy(() => import('../views/pages/controlPanel/analytics/OverviewTab')));
const AnalyticsAudience = Loadable(lazy(() => import('../views/pages/controlPanel/analytics/AudienceTab')));
const AnalyticsSequences = Loadable(lazy(() => import('../views/pages/controlPanel/analytics/SequencesTab')));
const AnalyticsSequenceDetail = Loadable(lazy(() => import('../views/pages/controlPanel/analytics/SequenceDetail')));

const AccountSettings = Loadable(lazy(() => import('../views/pages/controlPanel/accountSettings')));
const UserProfile = Loadable(lazy(() => import('../views/pages/controlPanel/accountSettings/UserProfile')));
const Account = Loadable(lazy(() => import('../views/pages/controlPanel/accountSettings/Account')));
const Notifications = Loadable(lazy(() => import('../views/pages/controlPanel/accountSettings/Notifications')));
const ChangePassword = Loadable(lazy(() => import('../views/pages/controlPanel/accountSettings/ChangePassword')));

const ViewerPageTemplates = Loadable(lazy(() => import('../views/pages/controlPanel/viewerPageTemplates')));
const FreeTemplates = Loadable(lazy(() => import('../views/pages/controlPanel/viewerPageTemplates/FreeTemplates')));
const PremiumTemplates = Loadable(lazy(() => import('../views/pages/controlPanel/viewerPageTemplates/PremiumTemplates')));

const Tracker = Loadable(lazy(() => import('../views/pages/controlPanel/tracker')));
const ShowsMap = Loadable(lazy(() => import('../views/pages/controlPanel/showsMap')));

const Admin = Loadable(lazy(() => import('../views/pages/controlPanel/admin')));
const AccountDetails = Loadable(lazy(() => import('../views/pages/controlPanel/admin/AccountDetails')));

const ImageHosting = Loadable(lazy(() => import('../views/pages/controlPanel/imageHosting')));

const MainRoutes = {
  path: '/',
  element: (
    <AuthGuard>
      <MainLayout />
    </AuthGuard>
  ),
  children: [
    {
      path: '/',
      element: <Landing />
    },
    {
      path: '/control-panel',
      element: <Navigate to="/control-panel/dashboard" />
    },
    // Sub-route layouts use nested children with their own <Outlet />.
    // First child is the index/default redirect.
    {
      path: '/control-panel/account-settings',
      element: <AccountSettings />,
      children: [
        { index: true, element: <Navigate to="profile" replace /> },
        { path: 'profile', element: <UserProfile /> },
        { path: 'account', element: <Account /> },
        { path: 'notifications', element: <Notifications /> },
        { path: 'password', element: <ChangePassword /> }
      ]
    },
    {
      path: '/control-panel/dashboard',
      element: <Dashboard />
    },
    {
      path: '/control-panel/remote-falcon-settings',
      element: <ViewerSettings />,
      children: [
        { index: true, element: <Navigate to="viewer-control" replace /> },
        { path: 'viewer-control', element: <MainSettings /> },
        { path: 'viewer-page', element: <ViewerPageSettings /> },
        { path: 'jukebox', element: <JukeboxSettings /> },
        { path: 'voting', element: <VotingSettings /> },
        { path: 'safeguards', element: <InteractionSettings /> }
      ]
    },
    {
      path: '/control-panel/image-hosting',
      element: <ImageHosting />
    },
    {
      path: '/control-panel/viewer-page',
      element: <ViewerPage />
    },
    {
      path: '/control-panel/sequences',
      element: <Sequences />,
      children: [
        { index: true, element: <Navigate to="list" replace /> },
        { path: 'list', element: <SequencesList /> },
        { path: 'groups', element: <SequenceGroups /> }
      ]
    },
    {
      path: '/control-panel/analytics',
      element: <Analytics />,
      children: [
        { index: true, element: <Navigate to="overview" replace /> },
        { path: 'overview', element: <AnalyticsOverview /> },
        { path: 'audience', element: <AnalyticsAudience /> },
        { path: 'sequences-jukebox', element: <AnalyticsSequences mode="JUKEBOX" /> },
        { path: 'sequences-voting', element: <AnalyticsSequences mode="VOTING" /> }
      ]
    },
    // Sequence detail is a drill-down, not a tab — render outside the
    // SubNav shell so it gets its own back-link UX. Path uses singular
    // "/sequence/" (vs. the list at "/sequences") to dodge the menu's
    // path-segment-based active-item matcher, which would otherwise
    // highlight the sidebar Sequences item instead of Analytics.
    {
      path: '/control-panel/analytics/sequence/:sequenceName',
      element: <AnalyticsSequenceDetail />
    },
    {
      path: '/control-panel/viewer-page-templates',
      element: <ViewerPageTemplates />,
      children: [
        { index: true, element: <Navigate to="free" replace /> },
        { path: 'free', element: <FreeTemplates /> },
        { path: 'premium', element: <PremiumTemplates /> }
      ]
    },
    {
      path: '/control-panel/remote-falcon-tracker',
      element: <Tracker />
    },
    {
      path: '/control-panel/shows-map',
      element: <ShowsMap />
    },
    {
      path: '/control-panel/admin',
      element: <Admin />,
      children: [
        { index: true, element: <Navigate to="accounts" replace /> },
        { path: 'accounts', element: <AccountDetails /> }
      ]
    }
  ]
};

export default MainRoutes;
