import { memo } from 'react';

import { Typography } from '@mui/material';

import menuItem from '../../../../menu-items';
import { useSelector } from '../../../../store';

import NavGroup from './NavGroup';

const MenuList = () => {
  const { show } = useSelector((state) => state.show);
  const isAdmin = show?.showRole === 'ADMIN';

  const navItems = menuItem.items
    // The Admin section is admin-role-only — filter the entire group out
    // so non-admin users don't see an empty "Admin" header.
    .filter((item) => item.id !== 'control-panel-admin' || isAdmin)
    .map((item) => {
      switch (item.type) {
        case 'group':
          return <NavGroup key={item.id} item={item} />;
        default:
          return (
            <Typography key={item.id} variant="h6" color="error" align="center">
              Menu Items Error
            </Typography>
          );
      }
    });

  return <>{navItems}</>;
};

export default memo(MenuList);
