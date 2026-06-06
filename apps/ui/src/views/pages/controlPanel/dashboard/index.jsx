import { useEffect, useMemo, useRef, useState } from 'react';

import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import {
  Box,
  Button,
  ButtonGroup,
  ClickAwayListener,
  FormControlLabel,
  Grow,
  IconButton,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Stack,
  Switch,
  Tooltip,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { IconCheck, IconChevronDown, IconCopy, IconEraser, IconExternalLink } from '@tabler/icons-react';
import _ from 'lodash';
import PropTypes from 'prop-types';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import useDashboardLiveStats from '../../../../hooks/useDashboardLiveStats';
import useInterval from '../../../../hooks/useInterval';
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
  UPDATE_PREFERENCES
} from '../../../../utils/graphql/controlPanel/mutations';
import { GET_SHOW, NOTIFICATIONS } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

import LiveStatsRow from './LiveStatsRow';
import NowPlayingCard from './NowPlayingCard';
import PreShowChecklist from './PreShowChecklist';
import PsaQuickPlayCard from './PsaQuickPlayCard';

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

  // Below lg the dashboard is a single column. There we promote the PSA
  // quick-play card to the very top (it's the primary in-show action on a
  // phone); on desktop it sits in the right column under the Now Playing card.
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));

  const [deleteNowPlayingMutation] = useMutation(DELETE_NOW_PLAYING);
  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);

  // Refresh the show document on the same 5s cadence as dashboardLiveStats
  // so the whole NowPlayingCard updates in lockstep instead of having a
  // split-rate UX (top of card polling, queue list refreshing only on page
  // reload). Reaches every widget on the dashboard that reads from
  // Redux `show.*` — queue rows, PSA/Leader chip classification, leader
  // settings, override pill, etc.
  //
  // **Merge, don't replace.** GET_SHOW selects a subset of Show fields —
  // notably it omits `timezone`. If we replaced the Redux show outright,
  // timezone would null out and useDashboardLiveStats would short-circuit
  // forever (it gates on show.timezone), parking the cards in their
  // skeleton-loading state. The ref pattern is needed because onCompleted
  // would otherwise close over the show snapshot from when the interval
  // tick was scheduled.
  const [refetchShowQuery] = useLazyQuery(GET_SHOW, { fetchPolicy: 'network-only' });
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  }, [show]);
  useInterval(() => {
    // Only poll the (heavy) full GET_SHOW while the operator is actively
    // looking at a live show. A hidden tab needs no updates, and an idle
    // (non-live) dashboard's queue can't change — viewers can't request or
    // vote until viewer control is on. This keeps the heaviest query off
    // backgrounded and standby dashboards, which is what drove the
    // control-panel replica bump (PSA-v2 review item 13). Now Playing / Up
    // next still refresh via the separate useDashboardLiveStats poll.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    if (!showRef.current?.preferences?.viewerControlEnabled) {
      return;
    }
    refetchShowQuery({
      context: { headers: { Route: 'Control-Panel' } },
      onCompleted: (data) => {
        if (data?.getShow) {
          dispatch(setShow({ ...showRef.current, ...data.getShow }));
        }
      }
    });
  }, 5000);

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

  // The "Right now" stats band (4 tiles + compact FPP plugin card). Rendered
  // above the hero on desktop, but BELOW it on mobile so a phone operator sees
  // PSAs → Now Playing first, with the numbers a scroll away.
  const rightNowBand = (
    <>
      <Stack direction="row" alignItems="center" sx={{ minHeight: 32, mt: 1.5, mb: 1 }}>
        <SectionHeader label="Right now" sx={{ m: 0 }} />
      </Stack>
      <LiveStatsRow />
    </>
  );

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
          </Stack>
        }
      />

      {/* On mobile (single-column) promote the PSA quick-play card above
          everything — it's the primary action an operator taps from their phone
          mid-show. On desktop it lives in the right rail (rendered there below). */}
      {isMobile && (
        <Box sx={{ mt: 2.5 }}>
          <PsaQuickPlayCard />
        </Box>
      )}

      {/* Stats band — above the hero on desktop; on mobile it's rendered below
          the hero instead (see after the grid). */}
      {!isMobile && rightNowBand}

      {/* Hero + PSAs. Now Playing is the tall left column — its votes/queue list
          flexes to fill the height (no fixed cap). The PSA quick-play card sits
          in the right column, stretched to the same height so the two cards line
          up evenly. */}
      <Box
        sx={{
          display: 'grid',
          gap: gridSpacing,
          gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
          alignItems: 'stretch',
          mt: 1
        }}
      >
        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 32, mt: 2.5, mb: 1 }}>
            <SectionHeader label="Now playing" sx={{ m: 0 }} />
            <Tooltip title="Clear Now Playing / Up Next">
              <IconButton
                size="small"
                onClick={deleteNowPlaying}
                sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
              >
                <IconEraser size={16} stroke={1.75} />
              </IconButton>
            </Tooltip>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <NowPlayingCard />
          </Box>
        </Box>

        {/* Desktop: PSA quick-play in the right column, stretched even with Now
            Playing (flex:1). On mobile it's rendered at the very top instead. The
            aria-hidden spacer matches the "Now playing" header so the tops align. */}
        {!isMobile && (
          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box aria-hidden sx={{ minHeight: 32, mt: 2.5, mb: 1 }} />
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <PsaQuickPlayCard />
            </Box>
          </Box>
        )}
      </Box>

      {/* On mobile the stats band renders here — below Now Playing — so the
          phone view reads PSAs → Now Playing → numbers. */}
      {isMobile && rightNowBand}

      {/* Pre-show readiness lives below the live operational data —
          it's reference/setup help, not above-the-fold time-sensitive.
          Extra top margin separates it from the columns above so the title
          doesn't crowd the Now Playing / FPP card bottoms. */}
      <SectionHeader label="Pre-show readiness" sx={{ mt: 5 }} />
      <PreShowChecklist />

      {/* Date-range stat browser used to live here (DashboardCharts). It was
          removed in the dashboard restructure (V17/V18 landing) — Analytics
          now owns longitudinal stat exploration. */}
    </Box>
  );
};

export default Dashboard;
