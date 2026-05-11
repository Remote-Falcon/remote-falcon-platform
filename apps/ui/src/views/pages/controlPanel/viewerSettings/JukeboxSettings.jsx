import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@apollo/client';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
import { Grid, CardActions, Divider, Typography, TextField, Stack, Switch } from '@mui/material';
import _ from 'lodash';

import MainCard from '../../../../ui-component/cards/MainCard';
import StickyFormBar from '../../../../ui-component/StickyFormBar';
import useAutoSave from '../../../../hooks/useAutoSave';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { UPDATE_PREFERENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

const JukeboxSettings = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);

  const [values, setValues] = useState({
    jukeboxDepth: show?.preferences?.jukeboxDepth ?? 0,
    jukeboxRequestLimit: show?.preferences?.jukeboxRequestLimit ?? 0,
    checkIfRequested: !!show?.preferences?.checkIfRequested
  });

  useEffect(() => {
    setValues({
      jukeboxDepth: show?.preferences?.jukeboxDepth ?? 0,
      jukeboxRequestLimit: show?.preferences?.jukeboxRequestLimit ?? 0,
      checkIfRequested: !!show?.preferences?.checkIfRequested
    });
  }, [
    show?.preferences?.jukeboxDepth,
    show?.preferences?.jukeboxRequestLimit,
    show?.preferences?.checkIfRequested
  ]);

  const save = useCallback(
    (snapshot) =>
      new Promise((resolve, reject) => {
        const updatedPreferences = _.cloneDeep({ ...show?.preferences, ...snapshot });
        savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
          if (response?.success) {
            dispatch(setShow({ ...show, preferences: updatedPreferences }));
            resolve();
          } else {
            showAlert(dispatch, response?.toast);
            reject(new Error('save failed'));
          }
        });
      }),
    [dispatch, show, updatePreferencesMutation]
  );

  // Numeric fields can briefly hold NaN as the user clears the input —
  // skip auto-save while that's the case so we don't write garbage.
  const isValid = useCallback(
    () => Number.isFinite(values.jukeboxDepth) && Number.isFinite(values.jukeboxRequestLimit),
    [values]
  );

  const status = useAutoSave(values, save, { isValid });

  return (
    <>
      <Grid item xs={12}>
        <MainCard content={false}>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Jukebox Queue Depth</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#jukebox-queue-depth',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Controls how many sequences can be in the Jukebox Queue (use 0 for unlimited queue depth).
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  type="number"
                  fullWidth
                  label="Jukebox Queue Depth"
                  value={Number.isFinite(values.jukeboxDepth) ? values.jukeboxDepth : ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, jukeboxDepth: parseInt(e.target.value, 10) }))
                  }
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Jukebox Sequence Request Limit</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#jukebox-sequence-request-limit',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Controls when a sequence can be requested if it already exists in the queue. Use 0 to allow any sequence to be requested at
                  any time.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  type="number"
                  fullWidth
                  label="Jukebox Sequence Request Limit"
                  value={Number.isFinite(values.jukeboxRequestLimit) ? values.jukeboxRequestLimit : ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, jukeboxRequestLimit: parseInt(e.target.value, 10) }))
                  }
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Prevent Multiple Requests</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#prevent-multiple-requests',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Prevents a viewer from requesting more than one sequence while a song is currently playing.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  name="checkIfRequested"
                  color="primary"
                  checked={values.checkIfRequested}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, checkIfRequested: v }))}
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

export default JukeboxSettings;
