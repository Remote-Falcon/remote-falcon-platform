import * as React from 'react';

import {
  IconAdjustmentsHorizontal,
  IconBlockquote,
  IconBook,
  IconBrandDiscord,
  IconBrandFacebook,
  IconBug,
  IconChartHistogram,
  IconDashboard,
  IconFileUpload,
  IconManualGearbox,
  IconMap,
  IconPalette,
  IconPlaylist,
  IconUserCog
} from '@tabler/icons-react';
import { FormattedMessage } from 'react-intl';

// Sidebar sections per the v2 dashboard mockup
// (apps/ui/docs/design-system/mockup.html, [data-screen="control"]).
// Each top-level entry is its own group → NavGroup renders the title
// as a section subheader. The Admin group is filtered out at MenuList
// for non-admin users.

const showGroup = {
  id: 'control-panel-show',
  type: 'group',
  title: 'Show',
  children: [
    {
      id: 'dashboard',
      title: <FormattedMessage id="dashboard" />,
      type: 'item',
      url: '/control-panel/dashboard',
      icon: IconDashboard,
      breadcrumbs: false
    },
    {
      id: 'analytics',
      title: 'Analytics',
      type: 'item',
      url: '/control-panel/analytics',
      icon: IconChartHistogram,
      breadcrumbs: false
    },
    {
      id: 'sequences',
      title: <FormattedMessage id="sequences" />,
      type: 'item',
      url: '/control-panel/sequences',
      icon: IconPlaylist,
      breadcrumbs: false
    },
    {
      id: 'viewer-page',
      title: <FormattedMessage id="viewer-page" />,
      type: 'item',
      url: '/control-panel/viewer-page',
      icon: IconBlockquote,
      breadcrumbs: false
    },
    {
      id: 'viewer-page-templates',
      title: <FormattedMessage id="viewer-page-templates" />,
      type: 'item',
      url: '/control-panel/viewer-page-templates',
      icon: IconPalette,
      breadcrumbs: false
    }
  ]
};

const accountGroup = {
  id: 'control-panel-account',
  type: 'group',
  title: 'Account',
  children: [
    {
      id: 'account-settings',
      title: 'Account Settings',
      type: 'item',
      url: '/control-panel/account-settings',
      icon: IconUserCog,
      breadcrumbs: false
    },
    {
      id: 'remote-falcon-settings',
      title: <FormattedMessage id="remote-falcon-settings" />,
      type: 'item',
      url: '/control-panel/remote-falcon-settings',
      icon: IconAdjustmentsHorizontal,
      breadcrumbs: false
    },
    {
      id: 'image-hosting',
      title: 'Image Hosting',
      type: 'item',
      url: '/control-panel/image-hosting',
      icon: IconFileUpload,
      breadcrumbs: false
    }
  ]
};

const communityGroup = {
  id: 'control-panel-community',
  type: 'group',
  title: 'Community',
  children: [
    {
      id: 'shows-map',
      title: 'Shows Map',
      type: 'item',
      url: '/control-panel/shows-map',
      icon: IconMap,
      breadcrumbs: false
    }
  ]
};

// Help group bundles the docs + community channels. All three open in a
// new tab — the external-link affordance on NavItem flags that visually.
// Discord + Facebook moved here from the sidebar footer so they have a
// proper home alongside the rest of the support resources.
const helpGroup = {
  id: 'control-panel-help',
  type: 'group',
  title: 'Help',
  children: [
    {
      id: 'docs',
      title: 'Docs',
      type: 'item',
      url: 'https://docs.remotefalcon.com',
      icon: IconBook,
      external: true,
      target: true,
      breadcrumbs: false
    },
    {
      id: 'discord',
      title: 'Discord',
      type: 'item',
      url: 'https://discord.gg/sTsVtYzUyz',
      icon: IconBrandDiscord,
      external: true,
      target: true,
      breadcrumbs: false
    },
    {
      id: 'facebook',
      title: 'Facebook Group',
      type: 'item',
      url: 'https://www.facebook.com/groups/remotefalcon',
      icon: IconBrandFacebook,
      external: true,
      target: true,
      breadcrumbs: false
    },
    {
      // URL + onClick handler are injected at render time by MenuList so
      // the body can include live show/plugin/browser context. Keeping
      // the entry declarative here means the menu config stays a pure
      // export with no Redux dependency.
      id: 'report-bug',
      title: 'Report a bug',
      type: 'item',
      icon: IconBug,
      external: true,
      target: true,
      breadcrumbs: false
    }
  ]
};

const adminGroup = {
  id: 'control-panel-admin',
  type: 'group',
  title: 'Admin',
  children: [
    {
      id: 'admin',
      title: 'Admin',
      type: 'item',
      url: '/control-panel/admin',
      icon: IconManualGearbox,
      breadcrumbs: false
    }
  ]
};

export const controlPanelGroups = [showGroup, accountGroup, communityGroup, helpGroup, adminGroup];

export default controlPanelGroups;
