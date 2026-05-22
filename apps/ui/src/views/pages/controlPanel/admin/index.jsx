import * as React from 'react';

import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';

import { useSelector } from '../../../../store';
import PageHead from '../../../../ui-component/PageHead';
import SubNav from '../../../../ui-component/SubNav';

export const adminRoutes = [
  { label: 'Account Maintenance', to: '/control-panel/admin/accounts' },
  { label: 'Send Notification', to: '/control-panel/admin/notifications' }
];

const Admin = () => {
  const { show } = useSelector((state) => state.show);

  if (show?.showRole !== 'ADMIN') return null;

  return (
    <Box>
      <PageHead title="Remote Falcon Admin" description="Internal account maintenance." />
      <SubNav items={adminRoutes} />
      <Outlet />
    </Box>
  );
};

export default Admin;
