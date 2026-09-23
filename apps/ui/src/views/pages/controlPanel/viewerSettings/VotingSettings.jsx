import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@apollo/client';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
import { Grid, CardActions, Divider, Typography, Switch, Stack, TextField } from '@mui/material';
import _ from 'lodash';

import IpListField from '../../../../ui-component/IpListField';
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
    resetVotes: !!show?.preferences?.resetVotes,
    dailyVoteLimit: show?.preferences?.dailyVoteLimit ?? 0,
    votingExemptIps: show?.preferences?.votingExemptIps || []
  });

  useEffect(() => {
    setValues({
      checkIfVoted: !!show?.preferences?.checkIfVoted,
      resetVotes: !!show?.preferences?.resetVotes,
      dailyVoteLimit: show?.preferences?.dailyVoteLimit ?? 0,
      votingExemptIps: show?.preferences?.votingExemptIps || []
    });
  }, [
    show?.preferences?.checkIfVoted,
    show?.preferences?.resetVotes,
    show?.preferences?.dailyVoteLimit,
    show?.preferences?.votingExemptIps
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

  const isValid = useCallback(() => Number.isFinite(values.dailyVoteLimit), [values]);

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
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Daily Vote Limit</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#daily-vote-limit',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Limits how many times a viewer can vote per day (0 = no limit). Exempt devices below are not affected.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  type="number"
                  fullWidth
                  label="Votes Per Day"
                  value={Number.isFinite(values.dailyVoteLimit) ? values.dailyVoteLimit : ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, dailyVoteLimit: parseInt(e.target.value, 10) }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Voting-Exempt Devices</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#voting-exempt-devices',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  IP addresses exempt from the multiple-vote restriction and the daily vote limit — e.g. a shared lawn kiosk. Accepts a
                  single address, a CIDR block (203.0.113.0/24), or a range (203.0.113.10-203.0.113.40). Type an address and press Enter.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <IpListField
                  label="Exempt IPs"
                  value={values.votingExemptIps}
                  onChange={(v) => setValues((prev) => ({ ...prev, votingExemptIps: v }))}
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
