import React from 'react';

import { Navigate } from 'react-router-dom';

import MainLayout from '../layout/MainLayout';
import Loadable from '../ui-component/Loadable';
import lazyChunk from '../utils/lazyChunk';
import AuthGuard from '../utils/route-guard/AuthGuard';

const Landing = Loadable(lazyChunk(() => import('../views/pages/landing')));
const Dashboard = Loadable(lazyChunk(() => import('../views/pages/controlPanel/dashboard')));

const ViewerSettings = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerSettings')));
const MainSettings = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerSettings/MainSettings')));
const ViewerPageSettings = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerSettings/ViewerPageSettings')));
const JukeboxSettings = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerSettings/JukeboxSettings')));
const VotingSettings = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerSettings/VotingSettings')));
const InteractionSettings = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerSettings/InteractionSettings')));

const ViewerPage = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerPage')));
const Sequences = Loadable(lazyChunk(() => import('../views/pages/controlPanel/sequences')));
const SequencesList = Loadable(lazyChunk(() => import('../views/pages/controlPanel/sequences/SequencesList')));
const SequenceGroups = Loadable(lazyChunk(() => import('../views/pages/controlPanel/sequences/SequenceGroups')));
const Categories = Loadable(lazyChunk(() => import('../views/pages/controlPanel/sequences/Categories')));
// PSA-v2 PR-5 — new Special Roles tab on the Sequences page.
const SpecialRoles = Loadable(lazyChunk(() => import('../views/pages/controlPanel/sequences/SpecialRoles')));

const Analytics = Loadable(lazyChunk(() => import('../views/pages/controlPanel/analytics')));
const AnalyticsOverview = Loadable(lazyChunk(() => import('../views/pages/controlPanel/analytics/OverviewTab')));
const AnalyticsAudience = Loadable(lazyChunk(() => import('../views/pages/controlPanel/analytics/AudienceTab')));
const AnalyticsSequences = Loadable(lazyChunk(() => import('../views/pages/controlPanel/analytics/SequencesTab')));
const AnalyticsSequenceDetail = Loadable(lazyChunk(() => import('../views/pages/controlPanel/analytics/SequenceDetail')));

const AccountSettings = Loadable(lazyChunk(() => import('../views/pages/controlPanel/accountSettings')));
const UserProfile = Loadable(lazyChunk(() => import('../views/pages/controlPanel/accountSettings/UserProfile')));
const Account = Loadable(lazyChunk(() => import('../views/pages/controlPanel/accountSettings/Account')));
const Notifications = Loadable(lazyChunk(() => import('../views/pages/controlPanel/accountSettings/Notifications')));
const ChangePassword = Loadable(lazyChunk(() => import('../views/pages/controlPanel/accountSettings/ChangePassword')));
const TwoFactorAuth = Loadable(lazyChunk(() => import('../views/pages/controlPanel/accountSettings/TwoFactorAuth')));

const ViewerPageTemplates = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerPageTemplates')));
const FreeTemplates = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerPageTemplates/FreeTemplates')));
const PremiumTemplates = Loadable(lazyChunk(() => import('../views/pages/controlPanel/viewerPageTemplates/PremiumTemplates')));

const Tracker = Loadable(lazyChunk(() => import('../views/pages/controlPanel/tracker')));
const ShowsMap = Loadable(lazyChunk(() => import('../views/pages/controlPanel/showsMap')));

const Admin = Loadable(lazyChunk(() => import('../views/pages/controlPanel/admin')));
const AccountDetails = Loadable(lazyChunk(() => import('../views/pages/controlPanel/admin/AccountDetails')));
const SendNotification = Loadable(lazyChunk(() => import('../views/pages/controlPanel/admin/SendNotification')));

const ImageHosting = Loadable(lazyChunk(() => import('../views/pages/controlPanel/imageHosting')));

const QrCode = Loadable(lazyChunk(() => import('../views/pages/controlPanel/qrCode')));

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
        { path: 'password', element: <ChangePassword /> },
        { path: 'two-factor', element: <TwoFactorAuth /> }
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
      path: '/control-panel/qr-code',
      element: <QrCode />
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
        { path: 'groups', element: <SequenceGroups /> },
        { path: 'categories', element: <Categories /> },
        { path: 'special-roles', element: <SpecialRoles /> }
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
        { path: 'accounts', element: <AccountDetails /> },
        { path: 'notifications', element: <SendNotification /> }
      ]
    }
  ]
};

export default MainRoutes;
