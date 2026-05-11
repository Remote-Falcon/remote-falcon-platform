import { useRef, useState } from 'react';

import { useMutation } from '@apollo/client';
import {
  Box,
  Button,
  ButtonGroup,
  ClickAwayListener,
  Grid,
  Grow,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Stack,
  Typography
} from '@mui/material';
import { IconCheck, IconChevronDown, IconCopy, IconExternalLink } from '@tabler/icons-react';
import PropTypes from 'prop-types';

import useShowPublicUrl from '../../../../hooks/useShowPublicUrl';
import { useDispatch, useSelector } from '../../../../store';
import { gridSpacing } from '../../../../store/constant';
import PageHead from '../../../../ui-component/PageHead';
import { ViewerControlMode } from '../../../../utils/enum';
import { DELETE_NOW_PLAYING, RESET_ALL_VOTES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

import HealthRow from './HealthRow';
import LiveStatsRow from './LiveStatsRow';
import NowPlayingCard from './NowPlayingCard';
import PreShowChecklist from './PreShowChecklist';

// Section header shared across the dashboard rows. Kept inline because
// the only user is this page; promote to ui-component if anyone else
// reaches for the same treatment.
const SectionHeader = ({ label }) => (
  <Typography
    variant="overline"
    sx={{
      display: 'block',
      color: 'text.secondary',
      letterSpacing: '0.08em',
      fontWeight: 600,
      mb: 1,
      mt: 2.5
    }}
  >
    {label}
  </Typography>
);

// View public page split button. Primary action opens the URL in a new
// tab; the chevron opens a one-item menu to copy the URL. Avatar profile
// menu used to carry these actions too — they're consolidated here so a
// new owner can find them without hunting in the user menu.
const ViewPublicPageButton = ({ publicUrl }) => {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!publicUrl) return null;

  const open_ = () => window.open(publicUrl, '_blank', 'noreferrer');
  const copy_ = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
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

  const isLive = !!show?.preferences?.viewerControlEnabled;
  const isJukebox = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX;

  const resetAllVotes = () => {
    resetAllVotesMutation({
      context: { headers: { Route: 'Control-Panel' } },
      onCompleted: () => showAlert(dispatch, { message: 'All Votes Reset' }),
      onError: () => showAlert(dispatch, { alert: 'error' })
    }).then();
  };

  const deleteNowPlaying = () => {
    deleteNowPlayingMutation({
      context: { headers: { Route: 'Control-Panel' } },
      onCompleted: () => showAlert(dispatch, { message: 'Now Playing/Up next Cleared' }),
      onError: () => showAlert(dispatch, { alert: 'error' })
    }).then();
  };

  return (
    <Box>
      <PageHead
        eyebrow={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              component="span"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: isLive ? 'success.main' : 'text.disabled',
                boxShadow: isLive ? '0 0 0 3px rgba(76,175,80,0.18)' : 'none'
              }}
            />
            {show?.showName ? `Show · ${show.showName}` : 'Show'}
          </Box>
        }
        title="Tonight's show"
        description={isLive ? 'Live · viewer control is enabled.' : 'Standby · viewer control is paused.'}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
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

      <SectionHeader label="Right now" />
      <Grid container spacing={gridSpacing}>
        <Grid item xs={12} lg={8}>
          {/* LiveStatsRow + HealthRow stack vertically in the left column,
              filling the empty space below the 4 stat tiles next to the
              NowPlayingCard on the right. */}
          <Stack spacing={2}>
            <LiveStatsRow />
            <HealthRow />
          </Stack>
        </Grid>
        <Grid item xs={12} lg={4}>
          <NowPlayingCard onClearNowPlaying={deleteNowPlaying} />
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
