import * as React from 'react';

import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';

import PageHead from '../../../../ui-component/PageHead';
import SubNav from '../../../../ui-component/SubNav';

export const accountSettingsRoutes = [
  { label: 'User Profile', to: '/control-panel/account-settings/profile' },
  { label: 'Account', to: '/control-panel/account-settings/account' },
  { label: 'Notifications', to: '/control-panel/account-settings/notifications' },
  { label: 'Change Password', to: '/control-panel/account-settings/password' }
];

const AccountSettings = () => (
  <Box>
    <PageHead
      title="Account Settings"
      description="Profile, show token, notifications, and password. Profile changes save automatically."
    />
    <SubNav items={accountSettingsRoutes} />
    <Outlet />
  </Box>
);

export default AccountSettings;
