import { useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery } from '@apollo/client';
import {
  Box,
  Button,
  ButtonGroup,
  ClickAwayListener,
  FormControlLabel,
  Grid,
  Grow,
  IconButton,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Stack,
  Switch,
  Tooltip
} from '@mui/material';
import { IconCheck, IconChevronDown, IconCopy, IconEraser, IconExternalLink } from '@tabler/icons-react';
import _ from 'lodash';
import PropTypes from 'prop-types';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import useDismissedNotifications from '../../../../hooks/useDismissedNotifications';
import useShowPublicUrl from '../../../../hooks/useShowPublicUrl';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { gridSpacing } from '../../../../store/constant';
import LiveIndicator from '../../../../ui-component/LiveIndicator';
import PageHead from '../../../../ui-component/PageHead';
import SectionHeader from '../../../../ui-component/SectionHeader';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { ViewerControlMode } from '../../../../utils/enum';
import {
  DELETE_NOW_PLAYING,
  RESET_ALL_VOTES,
  UPDATE_PREFERENCES
} from '../../../../utils/graphql/controlPanel/mutations';
import { NOTIFICATIONS } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

import HealthRow from './HealthRow';
import LiveStatsRow from './LiveStatsRow';
import NowPlayingCard from './NowPlayingCard';
import PreShowChecklist from './PreShowChecklist';

// View public page split button. Primary action opens the URL in a new
// tab; the chevron opens a one-item menu to copy the URL. Avatar profile
// menu used to carry these actions too — they're consolidated here so a
// new owner can find them without hunting in the user menu.
const ViewPublicPageButton = ({ publicUrl }) => {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!publicUrl) return null;

  const open_ = () => {
    trackPosthogEvent('dashboard_quick_action', { action: 'view_public_page' });
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  };
  const copy_ = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      trackPosthogEvent('dashboard_quick_action', { action: 'copy_public_url' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <>
      <ButtonGroup variant="outlined" color="primary" ref={anchorRef} aria-label="View public page actions">
        <Button startIcon={<IconExternalLink size={16} stroke={1.75} />} onClick={open_}>
          View public page
        </Button>
        <Button
          size="small"
          aria-label="More public page actions"
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
          sx={{ px: 0.75 }}
        >
          <IconChevronDown size={16} stroke={1.75} />
        </Button>
      </ButtonGroup>
      <Popper open={open} anchorEl={anchorRef.current} role={undefined} placement="bottom-end" transition disablePortal>
        {({ TransitionProps }) => (
          <Grow {...TransitionProps}>
            <Paper sx={{ mt: 0.5, minWidth: 220, boxShadow: 6 }}>
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <MenuList>
                  <MenuItem
                    onClick={() => {
                      copy_();
                      setOpen(false);
                    }}
                  >
                    <Box sx={{ mr: 1, display: 'inline-flex', color: 'text.secondary' }}>
                      {copied ? <IconCheck size={16} stroke={2} /> : <IconCopy size={16} stroke={1.75} />}
                    </Box>
                    {copied ? 'Link copied' : 'Copy public URL'}
                  </MenuItem>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
};

ViewPublicPageButton.propTypes = {
  publicUrl: PropTypes.string
};

const Dashboard = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const publicUrl = useShowPublicUrl();

  const [resetAllVotesMutation] = useMutation(RESET_ALL_VOTES);
  const [deleteNowPlayingMutation] = useMutation(DELETE_NOW_PLAYING);
  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);

  // Notification nudge — when the operator lands on the dashboard and
  // has unread items, fire a one-line snackbar pointing at the bell.
  // Apollo's normalized cache shares the result with the header bell,
  // so this query doesn't double-fetch when both are mounted.
  const { data: notificationsData } = useQuery(NOTIFICATIONS, {
    fetchPolicy: 'cache-and-network',
    context: { headers: { Route: 'Control-Panel' } }
  });
  const { dismissedSet } = useDismissedNotifications();
  const unreadCount = useMemo(() => {
    const list = Array.isArray(notificationsData?.getNotifications)
      ? notificationsData.getNotifications
      : [];
    return list.filter((n) => n && n.uuid && !dismissedSet.has(n.uuid)).length;
  }, [notificationsData, dismissedSet]);

  // Fire exactly once per mount, regardless of re-renders or refetches.
  // Without the ref, Apollo's cache-and-network refresh would re-trigger.
  const nudgedRef = useRef(false);
  useEffect(() => {
    if (nudgedRef.current) return;
    if (!notificationsData) return; // wait for the first query result
    if (unreadCount <= 0) return;
    nudgedRef.current = true;
    showAlert(dispatch, {
      message: `You have ${unreadCount} new notification${unreadCount === 1 ? '' : 's'}`
    });
    trackPosthogEvent('notification_snackbar_shown', { unread_count: unreadCount });
  }, [dispatch, notificationsData, unreadCount]);

  // Refetch the live-stats query immediately after mutations the operator
  // expects to see reflected in the dashboard right away (Reset Votes,
  // Clear Now Playing). Without this they'd wait up to one poll interval
  // for the new value to land.
  const { refetch: refetchLiveStats } = useDashboardLiveStats();

  const isLive = !!show?.preferences?.viewerControlEnabled;
  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;

  // Duplicate of the Viewer Control toggle on the Remote Falcon Settings
  // page — operators who land on the dashboard often just want to flip
  // the show on/off without clicking through. Uses the same mutation +
  // local-Redux sync as the settings page so both surfaces stay in
  // lockstep. PostHog tag carries `source: 'dashboard'` to match the
  // existing instrumentation pattern from command_palette / settings.
  const toggleViewerControl = (next) => {
    const updatedPreferences = _.cloneDeep({ ...show?.preferences, viewerControlEnabled: next });
    savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...show, preferences: updatedPreferences }));
        showAlert(dispatch, { message: next ? 'Viewer Control Enabled' : 'Viewer Control Disabled' });
        trackPosthogEvent('viewer_control_toggled', { enabled: next, source: 'dashboard' });
      } else {
        showAlert(dispatch, response?.toast);
      }
    });
  };

  const resetAllVotes = () => {
    trackPosthogEvent('dashboard_quick_action', { action: 'reset_votes' });
    resetAllVotesMutation({
      context: { headers: { Route: 'Control-Panel' } },
      onCompleted: () => {
        showAlert(dispatch, { message: 'All Votes Reset' });
        refetchLiveStats();
      },
      onError: () => showAlert(dispatch, { alert: 'error' })
    }).then();
  };

  const deleteNowPlaying = () => {
    trackPosthogEvent('dashboard_quick_action', { action: 'clear_now_playing' });
    deleteNowPlayingMutation({
      context: { headers: { Route: 'Control-Panel' } },
      onCompleted: () => {
        showAlert(dispatch, { message: 'Now Playing/Up next Cleared' });
        refetchLiveStats();
      },
      onError: () => showAlert(dispatch, { alert: 'error' })
    }).then();
  };

  return (
    <Box>
      <PageHead
        eyebrow={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <LiveIndicator active={isLive} size="sm" />
            {`${show?.showName ? `Show · ${show.showName}` : 'Show'} · ${isJukebox ? 'Jukebox' : 'Voting'} Mode`}
          </Box>
        }
        title="Tonight's show"
        description={isLive ? 'Live · viewer control is enabled.' : 'Standby · viewer control is paused.'}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Tooltip title={isLive ? 'Disable Viewer Control' : 'Enable Viewer Control'}>
              <FormControlLabel
                sx={{
                  m: 0,
                  '& .MuiFormControlLabel-label': { fontSize: 14, fontWeight: 500 }
                }}
                control={
                  <Switch
                    size="small"
                    checked={isLive}
                    onChange={(_e, v) => toggleViewerControl(v)}
                    inputProps={{ 'aria-label': 'Toggle viewer control' }}
                  />
                }
                label="Viewer Control"
                labelPlacement="end"
              />
            </Tooltip>
            <ViewPublicPageButton publicUrl={publicUrl} />
            {/* Reset Votes only makes sense in voting mode. Clear Now Playing/Up Next
                moved into the NowPlayingCard header where it belongs. */}
            {!isJukebox && (
              <Button variant="outlined" color="error" onClick={resetAllVotes}>
                Reset votes
              </Button>
            )}
          </Stack>
        }
      />

      {/* Section headers live inside each column so "Right now" and
          "Now playing" align horizontally — the NowPlayingCard's
          internal header was dropped in favor of this. */}
      <Grid container spacing={gridSpacing}>
        <Grid item xs={12} lg={8}>
          <SectionHeader label="Right now" />
          <Stack spacing={2}>
            <LiveStatsRow />
            <HealthRow />
          </Stack>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 32 }}>
            <SectionHeader label="Now playing" sx={{ mb: 0 }} />
            <Tooltip title="Clear Now Playing / Up Next">
              <IconButton
                size="small"
                onClick={deleteNowPlaying}
                sx={{ color: 'text.secondary', mt: 2.5, mb: 1, '&:hover': { color: 'error.main' } }}
              >
                <IconEraser size={16} stroke={1.75} />
              </IconButton>
            </Tooltip>
          </Stack>
          <NowPlayingCard />
        </Grid>
      </Grid>

      {/* Pre-show readiness lives below the live operational data —
          it's reference/setup help, not above-the-fold time-sensitive. */}
      <SectionHeader label="Pre-show readiness" />
      <PreShowChecklist />

      {/* Date-range stat browser used to live here (DashboardCharts). It was
          removed in the dashboard restructure (V17/V18 landing) — Analytics
          now owns longitudinal stat exploration. */}
    </Box>
  );
};

export default Dashboard;
