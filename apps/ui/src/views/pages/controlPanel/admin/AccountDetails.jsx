import { useState } from 'react';

import { useMutation, useLazyQuery } from '@apollo/client';
import { Grid, CardActions, Divider, Typography, Stack, TextField, Button } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import _ from 'lodash';
import { JsonEditor } from 'json-edit-react';
import { useNavigate } from 'react-router-dom';

import { setImpersonationSession } from '../../../../contexts/JWTContext';
import { setShow } from '../../../../store/slices/show';
import MainCard from '../../../../ui-component/cards/MainCard';
import { useDispatch } from '../../../../store';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { ADMIN_UPDATE_SHOW } from '../../../../utils/graphql/controlPanel/mutations';
import { GET_SHOW_BY_SHOW_NAME, IMPERSONATE, GET_SHOW, GET_SHOWS_AUTO_SUGGEST } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

const AccountDetails = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [showSearchValue, setShowSearchValue] = useState('');
  const [showOptions, setShowOptions] = useState([]);
  const [selectedShow, setSelectedShow] = useState({});
  const hasSelectedShow = !_.isEmpty(selectedShow);

  const [showByShowNameQuery] = useLazyQuery(GET_SHOW_BY_SHOW_NAME);
  const [adminUpdateShowMutation] = useMutation(ADMIN_UPDATE_SHOW);
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
        localStorage.setItem('isImpersonating', true);
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
                <Typography variant="h4">Show Name</Typography>
              </Stack>
              <Typography component="div" variant="caption">
                Enter the Show Name you want to view.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
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
                  <Button variant="outlined" onClick={selectAShow} sx={{ whiteSpace: 'nowrap' }}>
                    Get Show
                  </Button>
                </Stack>
                {hasSelectedShow && (
                  <Button variant="contained" onClick={impersonate}>Impersonate</Button>
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
    </Grid>
  );
};

export default AccountDetails;
