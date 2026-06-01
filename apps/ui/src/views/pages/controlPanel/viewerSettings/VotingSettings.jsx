import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@apollo/client';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
import { Grid, CardActions, Divider, Typography, Switch, Stack } from '@mui/material';
import _ from 'lodash';

import MainCard from '../../../../ui-component/cards/MainCard';
import StickyFormBar from '../../../../ui-component/StickyFormBar';
import useAutoSave from '../../../../hooks/useAutoSave';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { UPDATE_PREFERENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

const VotingSettings = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);

  const [values, setValues] = useState({
    checkIfVoted: !!show?.preferences?.checkIfVoted,
    resetVotes: !!show?.preferences?.resetVotes
  });

  useEffect(() => {
    setValues({
      checkIfVoted: !!show?.preferences?.checkIfVoted,
      resetVotes: !!show?.preferences?.resetVotes
    });
  }, [show?.preferences?.checkIfVoted, show?.preferences?.resetVotes]);

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
                  <Typography variant="h4">Prevent Multiple Votes</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#prevent-multiple-votes',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Prevents a viewer from voting more than once during a voting round.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  name="checkIfVoted"
                  color="primary"
                  checked={values.checkIfVoted}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, checkIfVoted: v }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Reset Votes After Round</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#reset-votes-after-round',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Resets all sequence votes back to zero after each voting round. Otherwise, votes will persist to the next round.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  name="resetVotes"
                  color="primary"
                  checked={values.resetVotes}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, resetVotes: v }))}
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

export default VotingSettings;
