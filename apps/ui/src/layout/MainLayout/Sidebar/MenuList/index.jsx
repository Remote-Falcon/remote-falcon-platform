import { memo, useCallback, useMemo } from 'react';

import { Typography } from '@mui/material';

import menuItem from '../../../../menu-items';
import { useSelector } from '../../../../store';
import buildReportBugUrl from '../../../../utils/buildReportBugUrl';

import NavGroup from './NavGroup';

const MenuList = () => {
  const { show } = useSelector((state) => state.show);
  const isAdmin = show?.showRole === 'ADMIN';

  // "Report a bug" opens a pre-filled GitHub issue with show/plugin/browser
  // context auto-baked in. Defined here (not in menu-items/) because the
  // menu config is a pure declarative export with no access to Redux —
  // this closure captures show state at render time and is re-bound on
  // every menu render so the URL reflects the latest plugin/FPP versions.
  const onClickReportBug = useCallback(() => {
    const url = buildReportBugUrl({
      showSubdomain: show?.showSubdomain,
      pluginVersion: show?.pluginVersion,
      fppVersion: show?.fppVersion,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent
    });
    // The third arg is windowFeatures; 'noopener,noreferrer' here both
    // prevents the opened tab from accessing window.opener (tabnabbing)
    // and suppresses the Referer header to the target. Bare 'noreferrer'
    // would be silently ignored as an unknown feature.
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [show?.showSubdomain, show?.pluginVersion, show?.fppVersion]);

  // Build the menu structure once per render, injecting the live onClick
  // handler into the "report-bug" item. The original config object is
  // never mutated.
  const enrichedItems = useMemo(
    () =>
      menuItem.items.map((group) => ({
        ...group,
        children: group.children?.map((child) =>
          child.id === 'report-bug' ? { ...child, onClick: onClickReportBug } : child
        )
      })),
    [onClickReportBug]
  );

  const navItems = enrichedItems
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
