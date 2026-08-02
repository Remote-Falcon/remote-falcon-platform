import { useState } from 'react';

import { useMutation, useLazyQuery } from '@apollo/client';
import CloseIcon from '@mui/icons-material/Close';
import {
  Grid,
  CardActions,
  CardContent,
  Divider,
  Typography,
  Stack,
  TextField,
  Button,
  Modal,
  IconButton,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Autocomplete from '@mui/material/Autocomplete';
import _ from 'lodash';
import { JsonEditor } from 'json-edit-react';
import { useNavigate } from 'react-router-dom';

import { setImpersonationSession } from '../../../../contexts/JWTContext';
import { setShow } from '../../../../store/slices/show';
import MainCard from '../../../../ui-component/cards/MainCard';
import { useDispatch } from '../../../../store';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import safeStorage from '../../../../utils/safeStorage';
import { adminResetMfaService } from '../../../../services/controlPanel/mutations.service';
import { ADMIN_UPDATE_SHOW, ADMIN_RESET_MFA } from '../../../../utils/graphql/controlPanel/mutations';
import {
  GET_SHOW_BY_SHOW_NAME,
  GET_SHOW_BY_EMAIL,
  IMPERSONATE,
  GET_SHOW,
  GET_SHOWS_AUTO_SUGGEST
} from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

const AccountDetails = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // 'showName' | 'email'. Show name gets prefix autosuggest (idx_showName
  // btree); email is exact-match only, because Mongo can't serve a $regex
  // from the idx_email_ci collation index that makes the lookup
  // case-insensitive. See ShowRepository#findByEmailCollation.
  const [searchMode, setSearchMode] = useState('showName');
  const [showSearchValue, setShowSearchValue] = useState('');
  const [emailSearchValue, setEmailSearchValue] = useState('');
  const [showOptions, setShowOptions] = useState([]);
  const [selectedShow, setSelectedShow] = useState({});
  const [resetMfaOpen, setResetMfaOpen] = useState(false);
  const [isResettingMfa, setIsResettingMfa] = useState(false);
  const hasSelectedShow = !_.isEmpty(selectedShow);
  const searchingByEmail = searchMode === 'email';

  const [showByShowNameQuery] = useLazyQuery(GET_SHOW_BY_SHOW_NAME);
  const [showByEmailQuery] = useLazyQuery(GET_SHOW_BY_EMAIL);
  const [adminUpdateShowMutation] = useMutation(ADMIN_UPDATE_SHOW);
  const [adminResetMfaMutation] = useMutation(ADMIN_RESET_MFA);
  const [impersonateQuery] = useLazyQuery(IMPERSONATE);
  const [getShowQuery] = useLazyQuery(GET_SHOW);
  const [getShowsAutoSuggestQuery] = useLazyQuery(GET_SHOWS_AUTO_SUGGEST);

  const getShowsAutoSuggest = async (showName) => {
    if (!showName || showName.length < 3) {
      setShowOptions([]);
      return;
    }

    await getShowsAutoSuggestQuery({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      variables: {
        showName
      },
      fetchPolicy: 'network-only',
      onCompleted: (data) => {
        setShowOptions(data?.getShowsAutoSuggest ?? []);
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    });
  };

  const selectAShow = async () => {
    if (searchingByEmail) {
      await selectAShowByEmail();
      return;
    }
    if (!showSearchValue) {
      return;
    }
    setSelectedShow({});
    await showByShowNameQuery({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      variables: {
        showName: showSearchValue
      },
      fetchPolicy: 'network-only',
      onCompleted: (data) => {
        if (data?.getShowByShowName != null) {
          setSelectedShow(data?.getShowByShowName);
        }
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    });
  };

  // Exact-match account lookup for support ("a user emailed me"). Unlike the
  // show-name path there's no autosuggest to confirm the value exists, so a
  // miss is reported explicitly rather than leaving the panel silently empty.
  const selectAShowByEmail = async () => {
    const email = emailSearchValue.trim();
    if (!email) {
      return;
    }
    setSelectedShow({});
    await showByEmailQuery({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      variables: {
        email
      },
      fetchPolicy: 'network-only',
      onCompleted: (data) => {
        if (data?.getShowByEmail != null) {
          setSelectedShow(data.getShowByEmail);
          return;
        }
        showAlert(dispatch, {
          alert: 'warning',
          message: `No account found with the email ${email}.`
        });
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    });
  };

  const impersonate = async () => {
    try {
      const impersonationResult = await impersonateQuery({
        context: {
          headers: {
            Route: 'Control-Panel'
          }
        },
        variables: {
          showSubdomain: selectedShow?.showSubdomain
        },
        fetchPolicy: 'network-only'
      });

      const serviceToken = impersonationResult?.data?.impersonateShow?.serviceToken;

      if (!serviceToken) {
        showAlert(dispatch, { alert: 'error' });
        return;
      }

      setImpersonationSession(serviceToken);

      const showResult = await getShowQuery({
        context: {
          headers: {
            Route: 'Control-Panel'
          }
        },
        fetchPolicy: 'network-only'
      });

      const showData = { ...showResult?.data?.getShow };
      if (!_.isEmpty(showData)) {
        safeStorage.setItem('isImpersonating', true);
        // Support audit: who impersonated whom and when. Actor is the
        // current posthog distinct_id (admin's identify from login);
        // target subdomain is captured as an event property.
        trackPosthogEvent('impersonation_started', {
          target_show_subdomain: showData?.showSubdomain,
          target_show_name: showData?.showName
        });
        showData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        dispatch(
          setShow({
            ...showData
          })
        );
      }

      setTimeout(() => {
        navigate('/control-panel/dashboard');
      }, 50);
    } catch (error) {
      showAlert(dispatch, { alert: 'error' });
    }
  };

  const resetMfa = () => {
    setIsResettingMfa(true);
    adminResetMfaService(selectedShow?.showSubdomain, adminResetMfaMutation, (response) => {
      if (response?.success) {
        trackPosthogEvent('admin_mfa_reset', {
          target_show_subdomain: selectedShow?.showSubdomain
        });
        setSelectedShow({ ...selectedShow, mfaEnabled: false });
      }
      showAlert(dispatch, response?.toast);
      setIsResettingMfa(false);
      setResetMfaOpen(false);
    });
  };

  const editStuff = (newValue) => {
    adminUpdateShowMutation({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      variables: {
        show: newValue?.newData
      },
      onCompleted: () => {
        setSelectedShow(newValue?.newData);
        showAlert(dispatch, { message: `Show Updated` });
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    }).then();
  };

  return (
    <Grid item xs={12}>
      <MainCard content={false}>
        <Divider />
        <CardActions>
          <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
            <Grid item xs={12} md={6} lg={4}>
              <Stack direction="row" spacing={2} pb={1}>
                <Typography variant="h4">Find an Account</Typography>
              </Stack>
              <Typography component="div" variant="caption">
                {searchingByEmail
                  ? 'Enter the full email address on the account. Exact match, not case sensitive.'
                  : 'Enter the Show Name you want to view.'}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <Stack spacing={2}>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={searchMode}
                  onChange={(_, newMode) => {
                    // MUI passes null when the active button is re-clicked;
                    // keep the current mode rather than ending up with none.
                    if (newMode == null || newMode === searchMode) {
                      return;
                    }
                    setSearchMode(newMode);
                    // Drop the loaded account along with the mode. Otherwise
                    // the panel keeps rendering the previous show -- with live
                    // Impersonate and Reset 2FA buttons -- next to a blank
                    // search box that implies nothing is selected. Both of
                    // those actions are too consequential to leave pointed at
                    // a stale target.
                    setSelectedShow({});
                  }}
                  aria-label="Account search mode"
                >
                  <ToggleButton value="showName" aria-label="Search by show name">
                    Show Name
                  </ToggleButton>
                  <ToggleButton value="email" aria-label="Search by email">
                    Email
                  </ToggleButton>
                </ToggleButtonGroup>
                <Stack direction="row" spacing={2}>
                  {searchingByEmail ? (
                    <TextField
                      fullWidth
                      type="email"
                      label="Email"
                      value={emailSearchValue}
                      onChange={(event) => setEmailSearchValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          selectAShow();
                        }
                      }}
                    />
                  ) : (
                    <Autocomplete
                      fullWidth
                      options={showOptions}
                      value={showSearchValue}
                      inputValue={showSearchValue}
                      onInputChange={(_, newInputValue, reason) => {
                        setShowSearchValue(newInputValue ?? '');
                        if (reason !== 'reset') {
                          getShowsAutoSuggest(newInputValue);
                        }
                      }}
                      onChange={(_, newValue) => {
                        if (typeof newValue === 'string') {
                          setShowSearchValue(newValue);
                        }
                      }}
                      renderInput={(params) => (
                        <TextField {...params} type="text" fullWidth label="Show Name" />
                      )}
                      freeSolo
                    />
                  )}
                  <Button variant="outlined" onClick={selectAShow} sx={{ whiteSpace: 'nowrap' }}>
                    Get Show
                  </Button>
                </Stack>
                {hasSelectedShow && (
                  <Button variant="contained" onClick={impersonate}>Impersonate</Button>
                )}
                {hasSelectedShow && (
                  <Button
                    variant="outlined"
                    color="error"
                    disabled={!selectedShow?.mfaEnabled}
                    onClick={() => setResetMfaOpen(true)}
                  >
                    Reset 2FA
                  </Button>
                )}
              </Stack>
            </Grid>
          </Grid>
        </CardActions>
        <CardActions>
          <Grid container alignItems="center" justifyContent="space-between">
            <Grid item xs={12} md={12} lg={12}>
              <JsonEditor
                data={_.cloneDeep(selectedShow)}
                onUpdate={editStuff}
                enableClipboard={false}
                restrictDelete
                minWidth="100%"
              />
            </Grid>
          </Grid>
        </CardActions>
        <Divider />
      </MainCard>
      <Modal
        open={resetMfaOpen}
        onClose={() => setResetMfaOpen(false)}
        aria-labelledby="reset-mfa-modal-title"
        aria-describedby="reset-mfa-modal-description"
      >
        <MainCard
          sx={{
            position: 'absolute',
            width: { xs: 280, lg: 450 },
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
          title="Reset Two-Factor Authentication"
          content={false}
          secondary={
            <IconButton onClick={() => setResetMfaOpen(false)} size="large">
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          <CardContent>
            <Typography variant="body2" sx={{ mt: 2 }}>
              This removes two-factor authentication from {selectedShow?.showName}, letting the owner sign in with just their
              password. Only do this after verifying the request is legitimate (lockout recovery). Continue?
            </Typography>
          </CardContent>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item>
                <Button variant="contained" size="large" onClick={() => setResetMfaOpen(false)}>
                  Cancel
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="contained"
                  size="large"
                  disabled={isResettingMfa}
                  sx={{ background: theme.palette.error.main, '&:hover': { background: theme.palette.error.dark } }}
                  onClick={resetMfa}
                >
                  Reset 2FA
                </Button>
              </Grid>
            </Grid>
          </CardActions>
        </MainCard>
      </Modal>
    </Grid>
  );
};

export default AccountDetails;
