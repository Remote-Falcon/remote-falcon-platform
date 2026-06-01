import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@apollo/client';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
import { Grid, CardActions, Divider, Typography, Autocomplete, Switch, TextField, Stack } from '@mui/material';
import _ from 'lodash';

import MainCard from '../../../../ui-component/cards/MainCard';
import StickyFormBar from '../../../../ui-component/StickyFormBar';
import useAutoSave from '../../../../hooks/useAutoSave';
import { ViewerControlMode } from '../../../../utils/enum';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { UPDATE_PREFERENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

const viewerControlModes = [
  { label: 'Jukebox', id: ViewerControlMode.JUKEBOX },
  { label: 'Voting', id: ViewerControlMode.VOTING }
];

// v2 settings pattern: local form state mirrors the preferences subset
// this tab owns. useAutoSave debounces persistence; StickyFormBar shows
// the live indicator. Per-field onBlur saves are gone — the user just
// edits, and saves stream in the background.
const MainSettings = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);

  const [values, setValues] = useState({
    viewerControlEnabled: !!show?.preferences?.viewerControlEnabled,
    viewerControlMode: show?.preferences?.viewerControlMode || ViewerControlMode.JUKEBOX
  });

  // If Redux preferences change from outside this tab (server refetch,
  // concurrent edit elsewhere), pull the new values in.
  useEffect(() => {
    setValues({
      viewerControlEnabled: !!show?.preferences?.viewerControlEnabled,
      viewerControlMode: show?.preferences?.viewerControlMode || ViewerControlMode.JUKEBOX
    });
  }, [show?.preferences?.viewerControlEnabled, show?.preferences?.viewerControlMode]);

  const save = useCallback(
    (snapshot) =>
      new Promise((resolve, reject) => {
        const updatedPreferences = _.cloneDeep({ ...show?.preferences, ...snapshot });
        savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
          if (response?.success) {
            dispatch(setShow({ ...show, preferences: updatedPreferences }));
            // Funnel events for changes that just landed.
            if (snapshot.viewerControlMode !== show?.preferences?.viewerControlMode) {
              trackPosthogEvent('control_mode_changed', {
                from: show?.preferences?.viewerControlMode,
                to: snapshot.viewerControlMode,
                source: 'settings'
              });
            }
            if (!!snapshot.viewerControlEnabled !== !!show?.preferences?.viewerControlEnabled) {
              trackPosthogEvent('viewer_control_toggled', {
                enabled: !!snapshot.viewerControlEnabled,
                source: 'settings'
              });
            }
            resolve();
          } else {
            showAlert(dispatch, response?.toast);
            reject(new Error('save failed'));
          }
        });
      }),
    [dispatch, show, updatePreferencesMutation]
  );

  const status = useAutoSave(values, save);

  return (
    <>
      <Grid item xs={12}>
        <MainCard content={false}>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Viewer Control</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#viewer-control',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Enables the ability for the viewer to be able to control your show.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  color="primary"
                  checked={values.viewerControlEnabled}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, viewerControlEnabled: v }))}
                  inputProps={{ 'aria-label': 'Toggle viewer control' }}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Viewer Control Mode</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#viewer-control-mode',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  The mode in which you want your viewer to be able to control your show. Changing modes requires a plugin restart.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Autocomplete
                  disableClearable
                  options={viewerControlModes}
                  value={_.find(viewerControlModes, (prop) => prop.id === values.viewerControlMode)}
                  renderInput={(params) => <TextField {...params} label="Viewer control mode" />}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, viewerControlMode: v?.id }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
        </MainCard>
      </Grid>
      <StickyFormBar status={status} />
    </>
  );
};

export default MainSettings;
