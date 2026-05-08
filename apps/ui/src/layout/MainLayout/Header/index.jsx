import { useEffect, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import LoadingButton from '@mui/lab/LoadingButton';
import { Avatar, Box, Modal, CircularProgress, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { IconMenu2 } from '@tabler/icons-react';
import _ from 'lodash';

import ThemeToggle from '../../../design-system/components/ThemeToggle';
import Customization from '../../../layout/Customization';
import { useDispatch, useSelector } from '../../../store';
import { openDrawer } from '../../../store/slices/menu';

import RFSplitButton from '../../../ui-component/RFSplitButton';
import { ViewerControlMode } from '../../../utils/enum';
import { DELETE_NOW_PLAYING, RESET_ALL_VOTES } from '../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../../views/pages/globalPageHelpers';
import LogoSection from '../LogoSection';
import LocalizationSection from './LocalizationSection';
import NotificationSection from './NotificationSection';
import ProfileSection from './ProfileSection';
import ViewJukeboxRequests from './ViewJukeboxRequests.modal';

const Header = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const { drawerOpen } = useSelector((state) => state.menu);
  const { show } = useSelector((state) => state.show);

  const [viewJukeboxRequestsOpen, setViewJukeboxRequestsOpen] = useState(false);
  const [actionOptions, setActionOptions] = useState([]);

  const [resetAllVotesMutation] = useMutation(RESET_ALL_VOTES);
  const [deleteNowPlayingMutation] = useMutation(DELETE_NOW_PLAYING);

  const resetAllVotes = () => {
    resetAllVotesMutation({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      onCompleted: () => {
        showAlert(dispatch, { message: 'All Votes Reset' });
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    }).then();
  };

  const deleteNowPlaying = () => {
    deleteNowPlayingMutation({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      onCompleted: () => {
        showAlert(dispatch, { message: 'Now Playing/Up next Cleared' });
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    }).then();
  };

  const takeAction = async (options, selectedIndex) => {
    if (selectedIndex === 0) {
      if (show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX) {
        setViewJukeboxRequestsOpen(true);
      } else {
        resetAllVotes();
      }
    } else if (selectedIndex === 1) {
      deleteNowPlaying();
    }
  };

  useEffect(() => {
    const options = [];
    options[0] = show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX ? 'View Queue' : 'Reset Votes';
    options[1] = 'Clear Now Playing/Up Next';
    setActionOptions(options);
  }, [show?.preferences?.viewerControlMode]);

  return (
    <>
      <Box
        sx={{
          width: 228,
          display: 'flex',
          [theme.breakpoints.down('md')]: {
            width: 'auto'
          }
        }}
      >
        <Box component="span" sx={{ display: { xs: 'none', md: 'block' }, flexGrow: 1 }}>
          <LogoSection />
        </Box>
        <Avatar
          variant="rounded"
          sx={{
            [theme.breakpoints.up('lg')]: {
              left: -80
            },
            ...theme.typography.commonAvatar,
            ...theme.typography.mediumAvatar,
            overflow: 'hidden',
            transition: 'all .2s ease-in-out',
            [theme.breakpoints.up('md')]: {
              mt: 2
            },
            background: theme.palette.mode === 'dark' ? theme.palette.dark.main : theme.palette.secondary.light,
            color: theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.secondary.dark,
            '&:hover': {
              background: theme.palette.mode === 'dark' ? theme.palette.secondary.main : theme.palette.secondary.dark,
              color: theme.palette.mode === 'dark' ? theme.palette.secondary.light : theme.palette.secondary.light
            }
          }}
          onClick={() => dispatch(openDrawer(!drawerOpen))}
          color="inherit"
        >
          <IconMenu2 stroke={1.5} size="50px" />
        </Avatar>
      </Box>

      <Box sx={{ flexGrow: 1 }} />
      <Box sx={{ flexGrow: 1 }} />

      <RFSplitButton options={actionOptions} color="error" onClick={(options, selectedIndex) => takeAction(options, selectedIndex)} />

      {/* Theme toggle — Phase 2 of the v2 migration. Lives in the chrome
          stack alongside notifications, customization, and the profile
          chip. Persists via the same `rf-config` localStorage key that
          the marketing AppBar's toggle uses, so flipping here also flips
          the public surfaces and vice versa. */}
      <Box sx={{ ml: 1 }}>
        <ThemeToggle />
      </Box>

      <Box sx={{ mr: -3 }}>
        <NotificationSection />
      </Box>

      <Box sx={{ mr: 1 }}>
        <LocalizationSection />
      </Box>

      <Box sx={{ ml: 2 }}>
        <Customization />
      </Box>

      <ProfileSection />

      <Modal
        open={viewJukeboxRequestsOpen}
        onClose={() => setViewJukeboxRequestsOpen(false)}
        aria-labelledby="simple-modal-title"
        aria-describedby="simple-modal-description"
      >
        <ViewJukeboxRequests handleClose={() => setViewJukeboxRequestsOpen(false)} />
      </Modal>
    </>
  );
};

export default Header;
