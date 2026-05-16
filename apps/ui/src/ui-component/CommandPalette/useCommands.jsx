import { useMemo } from 'react';

import { useMutation } from '@apollo/client';
import {
  IconArrowRight,
  IconArrowsShuffle,
  IconLogout,
  IconMusic,
  IconPower,
  IconSearch,
  IconTrash
} from '@tabler/icons-react';
import _ from 'lodash';
import { useNavigate } from 'react-router-dom';

import useAuth from '../../hooks/useAuth';
import controlPanelGroups from '../../menu-items/controlPanel';
import { savePreferencesService } from '../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../store';
import { setShow } from '../../store/slices/show';
import { trackPosthogEvent } from '../../utils/analytics/posthog';
import { ViewerControlMode } from '../../utils/enum';
import { DELETE_NOW_PLAYING, RESET_ALL_VOTES, UPDATE_PREFERENCES } from '../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../views/pages/globalPageHelpers';
import { accountSettingsRoutes } from '../../views/pages/controlPanel/accountSettings';
import { adminRoutes } from '../../views/pages/controlPanel/admin';
import { analyticsRoutes } from '../../views/pages/controlPanel/analytics';
import { viewerPageTemplatesRoutes } from '../../views/pages/controlPanel/viewerPageTemplates';
import { viewerSettingsRoutes } from '../../views/pages/controlPanel/viewerSettings';

// All commands the palette can execute. Each: { id, label, hint, group, icon, run }.
//
// Three buckets per the v2 mockup:
//   • Navigation — every menu item
//   • Sequences  — live data from show.sequences
//   • Actions    — common page-spanning operations
//
// Returned as a flat array; the palette filters + groups before render.
const useCommands = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { logout } = useAuth();
  const { show } = useSelector((state) => state.show);

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);
  const [resetAllVotesMutation] = useMutation(RESET_ALL_VOTES);
  const [deleteNowPlayingMutation] = useMutation(DELETE_NOW_PLAYING);

  return useMemo(() => {
    const commands = [];

    // Navigation — flatten all four sidebar groups. Item titles are sometimes
    // a `<FormattedMessage>` element (no plain string available without
    // running the i18n provider), so fall back to humanising the id.
    const humanize = (id) =>
      id
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

    // Top-level menu items
    controlPanelGroups.forEach((group) => {
      group.children?.forEach((item) => {
        if (!item.url) return;
        if (item.id === 'admin' && show?.showRole !== 'ADMIN') return;
        const label = typeof item.title === 'string' ? item.title : humanize(item.id);
        // External items (Docs) open in a new tab — `navigate()` would
        // throw on a fully-qualified URL.
        const run = item.external
          ? () => window.open(item.url, '_blank', 'noopener,noreferrer')
          : () => navigate(item.url);
        commands.push({
          id: `nav:${item.id}`,
          label,
          hint: `Navigate · ${group.title}`,
          group: 'Navigation',
          icon: item.icon ? <item.icon size={18} stroke={1.75} /> : <IconSearch size={18} stroke={1.75} />,
          run
        });
      });
    });

    // Sub-pages — direct deep links into tabbed sections.
    const SUB_ROUTE_GROUPS = [
      { parent: 'Settings', items: viewerSettingsRoutes },
      { parent: 'Account', items: accountSettingsRoutes },
      { parent: 'Templates', items: viewerPageTemplatesRoutes },
      { parent: 'Analytics', items: analyticsRoutes },
      ...(show?.showRole === 'ADMIN' ? [{ parent: 'Admin', items: adminRoutes }] : [])
    ];
    SUB_ROUTE_GROUPS.forEach(({ parent, items }) => {
      items.forEach((item) => {
        commands.push({
          id: `nav:${item.to}`,
          label: item.label,
          hint: `Navigate · ${parent}`,
          group: 'Navigation',
          icon: <IconArrowRight size={18} stroke={1.75} />,
          run: () => navigate(item.to)
        });
      });
    });

    // Sequences — deep-link straight to the analytics drill-down for the
    // selected sequence. The route is `/control-panel/analytics/sequence/:name`
    // (singular "sequence" by design — see MainRoutes.jsx note re: sidebar
    // active-item matcher). Name is encoded because owner-authored names
    // commonly contain spaces, slashes, and apostrophes.
    (show?.sequences || []).forEach((sequence) => {
      commands.push({
        id: `seq:${sequence.name}`,
        label: sequence.displayName || sequence.name,
        hint: `Sequence${sequence.artist ? ` · ${sequence.artist}` : ''}`,
        group: 'Sequences',
        icon: <IconMusic size={18} stroke={1.75} />,
        run: () => navigate(`/control-panel/analytics/sequence/${encodeURIComponent(sequence.name)}`)
      });
    });

    // Actions — wired to existing mutations / preferences flow
    const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;
    const viewerControlEnabled = !!show?.preferences?.viewerControlEnabled;

    const togglePreference = (field, value, message) => {
      const updated = _.cloneDeep({ ...show?.preferences, [field]: value });
      savePreferencesService(updated, updatePreferencesMutation, (response) => {
        if (response?.success) {
          dispatch(setShow({ ...show, preferences: updated }));
          showAlert(dispatch, { message });
        } else {
          showAlert(dispatch, response?.toast);
        }
      });
    };

    commands.push({
      id: 'act:toggle-viewer-control',
      label: viewerControlEnabled ? 'Disable Viewer Control' : 'Enable Viewer Control',
      hint: 'Action · Show',
      group: 'Actions',
      icon: <IconPower size={18} stroke={1.75} />,
      run: () => {
        const next = !viewerControlEnabled;
        togglePreference(
          'viewerControlEnabled',
          next,
          viewerControlEnabled ? 'Viewer Control Disabled' : 'Viewer Control Enabled'
        );
        trackPosthogEvent('viewer_control_toggled', { enabled: next, source: 'command_palette' });
      }
    });

    commands.push({
      id: 'act:switch-mode',
      label: isJukebox ? 'Switch to Voting mode' : 'Switch to Jukebox mode',
      hint: 'Action · Show',
      group: 'Actions',
      icon: <IconArrowsShuffle size={18} stroke={1.75} />,
      run: () => {
        const next = isJukebox ? ViewerControlMode.VOTING : ViewerControlMode.JUKEBOX;
        togglePreference(
          'viewerControlMode',
          next,
          isJukebox ? 'Switched to Voting mode' : 'Switched to Jukebox mode'
        );
        trackPosthogEvent('control_mode_changed', {
          from: isJukebox ? 'JUKEBOX' : 'VOTING',
          to: next,
          source: 'command_palette'
        });
      }
    });

    if (!isJukebox) {
      commands.push({
        id: 'act:reset-votes',
        label: 'Reset all votes',
        hint: 'Action · Show',
        group: 'Actions',
        icon: <IconTrash size={18} stroke={1.75} />,
        run: () => {
          resetAllVotesMutation({
            context: { headers: { Route: 'Control-Panel' } },
            onCompleted: () => showAlert(dispatch, { message: 'All Votes Reset' }),
            onError: () => showAlert(dispatch, { alert: 'error' })
          });
        }
      });
    }

    commands.push({
      id: 'act:clear-now-playing',
      label: 'Clear Now Playing / Up Next',
      hint: 'Action · Show',
      group: 'Actions',
      icon: <IconTrash size={18} stroke={1.75} />,
      run: () => {
        deleteNowPlayingMutation({
          context: { headers: { Route: 'Control-Panel' } },
          onCompleted: () => showAlert(dispatch, { message: 'Now Playing/Up next Cleared' }),
          onError: () => showAlert(dispatch, { alert: 'error' })
        });
      }
    });

    commands.push({
      id: 'act:logout',
      label: 'Sign out',
      hint: 'Action · Account',
      group: 'Actions',
      icon: <IconLogout size={18} stroke={1.75} />,
      run: () => logout()
    });

    return commands;
  }, [
    navigate,
    dispatch,
    logout,
    show,
    updatePreferencesMutation,
    resetAllVotesMutation,
    deleteNowPlayingMutation
  ]);
};

export default useCommands;
