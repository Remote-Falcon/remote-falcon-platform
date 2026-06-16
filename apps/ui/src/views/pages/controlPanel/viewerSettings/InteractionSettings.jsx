import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@apollo/client';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
import SaveTwoToneIcon from '@mui/icons-material/SaveTwoTone';
import { Button, Grid, CardActions, Divider, Typography, Switch, TextField, Autocomplete, IconButton, Tooltip, Stack } from '@mui/material';
import { IconChevronRight } from '@tabler/icons-react';
import _ from 'lodash';
import moment from 'moment/moment';
import { Link as RouterLink } from 'react-router-dom';

import MainCard from '../../../../ui-component/cards/MainCard';
import StickyFormBar from '../../../../ui-component/StickyFormBar';
import useAutoSave from '../../../../hooks/useAutoSave';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { LocationCheckMethod } from '../../../../utils/enum';
import { UPDATE_PREFERENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

const locationCheckMethods = [
  { label: 'GPS Location', id: 'GEO' },
  { label: 'Code', id: 'CODE' }
];

// Kept for backwards-compatible test coverage of the #66 chip-save
// regression guard. The list-management UI itself moved to the
// Sequences page → Special Roles tab in PSA-v2 PR-5, but the helper's
// contract (array-shape, normalized order, stamped lastPlayed) is
// still useful to keep pinned because the new tab uses the same shape
// when it persists wholesale add/remove ops.
export const buildPsaSequencesFromAutocompleteValue = (value) => {
  const safeValue = Array.isArray(value) ? value : [];
  const seqs = safeValue.map((psaSequence, index) => ({
    name: psaSequence?.label,
    order: index,
    lastPlayed: moment().format('YYYY-MM-DDTHH:mm:ss')
  }));
  const selected = safeValue.map((psaSequence) => ({
    label: psaSequence?.label,
    id: psaSequence?.label
  }));
  return { seqs, selected };
};

const InteractionSettings = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);

  // Auto-saved preference subset. Booleans + numbers + the IP list all
  // funnel through useAutoSave; geolocation stays on explicit click-action
  // because it's a paired multi-field operation. PSA list management
  // moved to the Sequences page → Special Roles tab in PSA-v2 PR-5.
  const [values, setValues] = useState({
    psaEnabled: !!show?.preferences?.psaEnabled,
    managePsa: !!show?.preferences?.managePsa,
    psaFrequency: show?.preferences?.psaFrequency ?? 0,
    // PSA-v2 PR-5 (Q4) — toggle next to PSA Frequency. False default
    // preserves the existing single-PSA-per-tick rotation behavior.
    playAllPsas: !!show?.preferences?.playAllPsas,
    locationCheckMethod: show?.preferences?.locationCheckMethod || LocationCheckMethod.NONE,
    allowedRadius: show?.preferences?.allowedRadius ?? 0,
    locationCode: show?.preferences?.locationCode ?? 0,
    hideSequenceCount: show?.preferences?.hideSequenceCount ?? 0,
    blockedViewerIps: show?.preferences?.blockedViewerIps || []
  });

  useEffect(() => {
    setValues({
      psaEnabled: !!show?.preferences?.psaEnabled,
      managePsa: !!show?.preferences?.managePsa,
      psaFrequency: show?.preferences?.psaFrequency ?? 0,
      playAllPsas: !!show?.preferences?.playAllPsas,
      locationCheckMethod: show?.preferences?.locationCheckMethod || LocationCheckMethod.NONE,
      allowedRadius: show?.preferences?.allowedRadius ?? 0,
      locationCode: show?.preferences?.locationCode ?? 0,
      hideSequenceCount: show?.preferences?.hideSequenceCount ?? 0,
      blockedViewerIps: show?.preferences?.blockedViewerIps || []
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.preferences]);

  // Click-action state — not auto-saved.
  const [currentLatitude, setCurrentLatitude] = useState(0.0);
  const [currentLongitude, setCurrentLongitude] = useState(0.0);

  const checkViewerPresent = values.locationCheckMethod !== LocationCheckMethod.NONE;

  const refreshLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLatitude(position.coords.latitude.toFixed(5));
        setCurrentLongitude(position.coords.longitude.toFixed(5));
      },
      () => {
        // Detection failed (permission denied / unavailable / timeout). Leave
        // the fields as-is so the inline "could not be detected" hint shows and
        // the owner can type their coordinates into the fields below.
      },
      // enableHighAccuracy requests a GPS-grade fix instead of the coarse
      // wifi/IP estimate that can land a mile off.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  const isValid = useCallback(
    () =>
      Number.isFinite(values.psaFrequency) &&
      Number.isFinite(values.allowedRadius) &&
      Number.isFinite(values.locationCode) &&
      Number.isFinite(values.hideSequenceCount),
    [values]
  );

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

  const status = useAutoSave(values, save, { isValid });

  // Click-action saves — left explicit by design.
  const handleCheckViewerPresentSwitch = (_event, value) => {
    setValues((prev) => ({
      ...prev,
      locationCheckMethod: value ? LocationCheckMethod.GEO : LocationCheckMethod.NONE
    }));
  };

  const saveCustomLocation = () => {
    setValues((prev) => ({
      ...prev,
      // Folding lat/long into the auto-saved set on click means they ride
      // the next debounced UPDATE_PREFERENCES like everything else.
      // Stored on `show.preferences` not in `values` until then.
    }));
    const updatedPreferences = _.cloneDeep({
      ...show?.preferences,
      showLatitude: parseFloat(currentLatitude),
      showLongitude: parseFloat(currentLongitude)
    });
    savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...show, preferences: updatedPreferences }));
      }
      showAlert(dispatch, response?.toast);
    });
  };

  const getSelectedLocationCheckMethod = () => {
    let selected = {};
    _.forEach(locationCheckMethods, (method) => {
      if (method.id === values.locationCheckMethod) selected = method;
    });
    return selected;
  };

  return (
    <>
      <Grid item xs={12}>
        <MainCard content={false}>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Play PSA</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#play-psa',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Enables the ability to play a PSA sequence after a specified number of requests or votes.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  name="psaEnabled"
                  color="primary"
                  checked={values.psaEnabled}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, psaEnabled: v }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          {values.psaEnabled && (
            <>
              <Divider />
              <CardActions>
                <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                  <Grid item xs={12} md={6} lg={4} ml={2}>
                    <Stack direction="row" spacing={2} pb={1}>
                      <Typography variant="h4">Managed PSA</Typography>
                      <InfoTwoToneIcon
                        onClick={() =>
                          window.open(
                            'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#managed-psa',
                            '_blank',
                            'noreferrer'
                          )
                        }
                        fontSize="small"
                      />
                    </Stack>
                    <Typography component="div" variant="caption">
                      Gives Remote Falcon the ability to fully manage your PSA and control when it plays, even if requests or votes are not
                      being made.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Switch
                      name="managePsa"
                      color="primary"
                      checked={values.managePsa}
                      onChange={(_e, v) => setValues((prev) => ({ ...prev, managePsa: v }))}
                    />
                  </Grid>
                </Grid>
              </CardActions>
              <Divider />
              {/*
                PSA-v2 PR-5 — the PSA list management UI (Autocomplete with
                multi-select chips) moved to the Sequences page → Special
                Roles tab. This redirect keeps the affordance discoverable
                from the old location for existing users until everyone has
                learned the new path. On ship-day a global admin bell
                notification (PRD-002) announces the move, so the redirect
                is the safety net rather than the primary path.
              */}
              <CardActions data-testid="psa-redirect">
                <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                  <Grid item xs={12} md={6} lg={4} ml={2}>
                    <Stack direction="row" spacing={2} pb={1}>
                      <Typography variant="h4">PSA Sequences</Typography>
                    </Stack>
                    <Typography component="div" variant="caption">
                      PSA management moved to the Sequences page. Add, remove, enable, and
                      choose the next PSA to play from a single place.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Button
                      component={RouterLink}
                      to="/control-panel/sequences/special-roles"
                      variant="outlined"
                      endIcon={<IconChevronRight size={16} />}
                      data-testid="manage-psas-link"
                    >
                      Manage PSAs
                    </Button>
                  </Grid>
                </Grid>
              </CardActions>
              <Divider />
              <CardActions>
                <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                  <Grid item xs={12} md={6} lg={4} ml={2}>
                    <Stack direction="row" spacing={2} pb={1}>
                      <Typography variant="h4">PSA Frequency</Typography>
                      <InfoTwoToneIcon
                        onClick={() =>
                          window.open(
                            'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#psa-frequency',
                            '_blank',
                            'noreferrer'
                          )
                        }
                        fontSize="small"
                      />
                    </Stack>
                    <Typography component="div" variant="caption">
                      Controls how often a PSA is played.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <TextField
                      type="number"
                      fullWidth
                      label="PSA Frequency"
                      value={Number.isFinite(values.psaFrequency) ? values.psaFrequency : ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, psaFrequency: parseInt(e.target.value, 10) }))}
                    />
                  </Grid>
                </Grid>
              </CardActions>
              <Divider />
              {/*
                PSA-v2 PR-5 (Q4) — "Play all PSAs at cadence" toggle. When
                on, the cadence tick bursts ALL enabled PSAs in `order`
                ascending instead of picking one round-robin. PR-2 owns
                the burst implementation; this toggle just persists the
                preference. Default false keeps the rotation behavior
                unchanged on first deploy.
              */}
              <CardActions>
                <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                  <Grid item xs={12} md={6} lg={4} ml={2}>
                    <Stack direction="row" spacing={2} pb={1}>
                      <Typography variant="h4">Play all PSAs at cadence</Typography>
                    </Stack>
                    <Typography component="div" variant="caption">
                      Burst every enabled PSA back-to-back at each cadence tick instead
                      of rotating one at a time.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Switch
                      name="playAllPsas"
                      color="primary"
                      checked={values.playAllPsas}
                      onChange={(_e, v) => setValues((prev) => ({ ...prev, playAllPsas: v }))}
                      inputProps={{
                        'aria-label': 'Play all PSAs at cadence',
                        'data-testid': 'play-all-psas-toggle'
                      }}
                    />
                  </Grid>
                </Grid>
              </CardActions>
            </>
          )}
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Check Viewer Present</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#check-viewer-present',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Enables checks to make sure the viewer is present before placing requests or votes.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch color="primary" checked={checkViewerPresent} onChange={handleCheckViewerPresentSwitch} />
              </Grid>
            </Grid>
          </CardActions>
          {checkViewerPresent && (
            <>
              <Divider />
              <CardActions>
                <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                  <Grid item xs={12} md={6} lg={4} ml={2}>
                    <Stack direction="row" spacing={2} pb={1}>
                      <Typography variant="h4">Viewer Present Mode</Typography>
                      <InfoTwoToneIcon
                        onClick={() =>
                          window.open(
                            'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#viewer-present-mode',
                            '_blank',
                            'noreferrer'
                          )
                        }
                        fontSize="small"
                      />
                    </Stack>
                    <Typography component="div" variant="caption">
                      The method in which you want to check that your viewer is present.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Autocomplete
                      disableClearable
                      options={locationCheckMethods}
                      value={getSelectedLocationCheckMethod()}
                      renderInput={(params) => <TextField {...params} label="" />}
                      onChange={(_e, v) => setValues((prev) => ({ ...prev, locationCheckMethod: v?.id }))}
                    />
                  </Grid>
                </Grid>
              </CardActions>
              {values.locationCheckMethod === LocationCheckMethod.GEO && (
                <>
                  <Divider />
                  <CardActions>
                    <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                      <Grid item xs={12} md={6} lg={4} ml={4}>
                        <Stack direction="row" spacing={2} pb={1}>
                          <Typography variant="h4">Show Location</Typography>
                          <InfoTwoToneIcon
                            onClick={() =>
                              window.open(
                                'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#show-location',
                                '_blank',
                                'noreferrer'
                              )
                            }
                            fontSize="small"
                          />
                        </Stack>
                        <Typography component="div" variant="caption">
                          Location of the show. Defaults to detected location, but can be changed if needed.
                          {currentLatitude === 0 && currentLongitude === 0 && (
                            <Typography component="div" color="#f44336">
                              Location could not be detected! Please ensure location permissions are allowed.
                            </Typography>
                          )}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6} lg={4}>
                        <Grid container alignItems="center" justifyContent="space-between" spacing={1}>
                          <Grid item xs={11} md={5} lg={5}>
                            <TextField
                              fullWidth
                              label="Latitude"
                              type="text"
                              value={currentLatitude}
                              onChange={(e) => setCurrentLatitude(e?.target?.value)}
                            />
                          </Grid>
                          <Grid item xs={11} md={5} lg={5}>
                            <TextField
                              fullWidth
                              label="Longitude"
                              type="text"
                              value={currentLongitude}
                              onChange={(e) => setCurrentLongitude(e?.target?.value)}
                            />
                          </Grid>
                          <Grid item xs={1} md={1} lg={1}>
                            <Tooltip placement="top" title="Save Custom Location">
                              <IconButton color="primary" size="large" onClick={saveCustomLocation}>
                                <SaveTwoToneIcon sx={{ fontSize: '1.5rem' }} />
                              </IconButton>
                            </Tooltip>
                          </Grid>
                        </Grid>
                        <Typography variant="h5" style={{ paddingTop: '1em' }}>
                          Saved Location: {show?.preferences?.showLatitude}, {show?.preferences?.showLongitude}
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardActions>
                  <Divider />
                  <CardActions>
                    <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                      <Grid item xs={12} md={6} lg={4} ml={4}>
                        <Stack direction="row" spacing={2} pb={1}>
                          <Typography variant="h4">Check Radius (in miles)</Typography>
                          <InfoTwoToneIcon
                            onClick={() =>
                              window.open(
                                'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#check-radius-in-miles',
                                '_blank',
                                'noreferrer'
                              )
                            }
                            fontSize="small"
                          />
                        </Stack>
                        <Typography component="div" variant="caption">
                          This number, in miles, determines how close the viewer should be to your location in order to place a request.
                          Default is 0.5 miles.
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6} lg={4}>
                        <TextField
                          fullWidth
                          label="Check Radius"
                          type="number"
                          step="any"
                          value={Number.isFinite(values.allowedRadius) ? values.allowedRadius : ''}
                          onChange={(e) => setValues((prev) => ({ ...prev, allowedRadius: parseFloat(e.target.value) }))}
                        />
                      </Grid>
                    </Grid>
                  </CardActions>
                </>
              )}
              {values.locationCheckMethod === LocationCheckMethod.CODE && (
                <>
                  <Divider />
                  <CardActions>
                    <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                      <Grid item xs={12} md={6} lg={4} ml={4}>
                        <Stack direction="row" spacing={2} pb={1}>
                          <Typography variant="h4">Location Code</Typography>
                          <InfoTwoToneIcon
                            onClick={() =>
                              window.open(
                                'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#location-code',
                                '_blank',
                                'noreferrer'
                              )
                            }
                            fontSize="small"
                          />
                        </Stack>
                        <Typography component="div" variant="caption">
                          This is the numerical code that will be entered by your viewer when requesting a sequence.
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6} lg={4}>
                        <TextField
                          fullWidth
                          label="Location Code"
                          type="number"
                          value={Number.isFinite(values.locationCode) ? values.locationCode : ''}
                          onChange={(e) => setValues((prev) => ({ ...prev, locationCode: parseInt(e.target.value, 10) }))}
                        />
                      </Grid>
                    </Grid>
                  </CardActions>
                </>
              )}
            </>
          )}
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Hide Sequence After Played</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#hide-sequence-after-played',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  When a requested sequence finishes, it will be hidden from the list until after this number of sequences has been played. If
                  set to 0, the sequence will not be hidden after it is played.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  fullWidth
                  label="Hide Sequence After Played"
                  type="number"
                  value={Number.isFinite(values.hideSequenceCount) ? values.hideSequenceCount : ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, hideSequenceCount: parseInt(e.target.value, 10) }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Block Viewer IP Addresses</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/account/remote-falcon-settings#block-viewer-ip-addresses',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Adding an IP address here will prevent the device from being able to request or vote on a sequence. After entering an IP
                  address, press enter.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Autocomplete
                  freeSolo
                  multiple
                  disableCloseOnSelect
                  filterSelectedOptions
                  options={[]}
                  value={values.blockedViewerIps}
                  renderInput={(params) => <TextField {...params} />}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, blockedViewerIps: v }))}
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

export default InteractionSettings;
