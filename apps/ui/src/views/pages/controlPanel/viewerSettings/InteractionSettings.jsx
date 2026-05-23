import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@apollo/client';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
import SaveTwoToneIcon from '@mui/icons-material/SaveTwoTone';
import { Grid, CardActions, Divider, Typography, Switch, TextField, Autocomplete, IconButton, Tooltip, Stack } from '@mui/material';
import _ from 'lodash';
import moment from 'moment/moment';

import MainCard from '../../../../ui-component/cards/MainCard';
import StickyFormBar from '../../../../ui-component/StickyFormBar';
import useAutoSave from '../../../../hooks/useAutoSave';

import { savePreferencesService, savePsaSequencesService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { LocationCheckMethod } from '../../../../utils/enum';
import { UPDATE_PREFERENCES, UPDATE_PSA_SEQUENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

const locationCheckMethods = [
  { label: 'GPS Location', id: 'GEO' },
  { label: 'Code', id: 'CODE' }
];

// Convert the MUI Autocomplete `value` (array of {label, id}) into the
// two shapes we need: the server-side `psaSequences` payload (with
// normalized 0..N-1 order + lastPlayed timestamp) and the UI's
// `selectedPsaOptions` chips array. Exported for unit testing — the
// PSA-list save-on-remove bug (#66) hinged on getting this shape
// right and persisting it on every change, not only on blur.
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
  const [updatePsaSequencesMutation] = useMutation(UPDATE_PSA_SEQUENCES);

  // Auto-saved preference subset. Booleans + numbers + the IP list all
  // funnel through useAutoSave; the PSA sequence list and detected
  // geolocation stay on explicit click-actions because they're paired
  // multi-field operations.
  const [values, setValues] = useState({
    psaEnabled: !!show?.preferences?.psaEnabled,
    managePsa: !!show?.preferences?.managePsa,
    psaFrequency: show?.preferences?.psaFrequency ?? 0,
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
      locationCheckMethod: show?.preferences?.locationCheckMethod || LocationCheckMethod.NONE,
      allowedRadius: show?.preferences?.allowedRadius ?? 0,
      locationCode: show?.preferences?.locationCode ?? 0,
      hideSequenceCount: show?.preferences?.hideSequenceCount ?? 0,
      blockedViewerIps: show?.preferences?.blockedViewerIps || []
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.preferences]);

  // Click-action state — not auto-saved.
  const [psaOptions, setPsaOptions] = useState([]);
  const [selectedPsaOptions, setSelectedPsaOptions] = useState([]);
  const [currentLatitude, setCurrentLatitude] = useState(0.0);
  const [currentLongitude, setCurrentLongitude] = useState(0.0);

  const checkViewerPresent = values.locationCheckMethod !== LocationCheckMethod.NONE;

  const getPsaOptions = useCallback(() => {
    const opts = [];
    _.forEach(show?.sequences, (sequence) => {
      opts.push({ label: sequence.name, id: sequence.name });
    });
    setPsaOptions(opts);
  }, [show]);

  const getSelectedPsaOptions = useCallback(() => {
    const selected = [];
    _.forEach(show?.psaSequences, (psa) => selected.push({ label: psa?.name, id: psa?.name }));
    setSelectedPsaOptions(selected);
  }, [show]);

  const refreshLocation = useCallback(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setCurrentLatitude(position.coords.latitude.toFixed(5));
        setCurrentLongitude(position.coords.longitude.toFixed(5));
      });
    } else {
      showAlert(dispatch, { alert: 'warning', message: 'Location is not enabled' });
    }
  }, [dispatch]);

  useEffect(() => {
    getPsaOptions();
    getSelectedPsaOptions();
    refreshLocation();
  }, [getPsaOptions, getSelectedPsaOptions, refreshLocation]);

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

  const handlePsaSequencesChange = (_event, value) => {
    const { seqs, selected } = buildPsaSequencesFromAutocompleteValue(value);
    setSelectedPsaOptions(selected);
    // Persist on every change. Previously this only ran from
    // Autocomplete's onBlur, which the chip X-button does not fire —
    // removing a PSA looked like it stuck visually but did not save
    // until the user clicked elsewhere (#66). Saving inline with the
    // fresh `seqs` (not the not-yet-committed React state) also
    // sidesteps a stale-state race on the next render.
    savePsaSequencesService(seqs, updatePsaSequencesMutation, (response) => {
      if (response?.success) {
        // Preserve array shape in the Redux dispatch. The previous
        // `{ ...psaSequences }` spread turned the array into an
        // object keyed by index, which the next useEffect's lodash
        // forEach iterated in unstable order.
        dispatch(setShow({ ...show, psaSequences: [...seqs] }));
      }
      showAlert(dispatch, response?.toast);
    });
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
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#play-psa',
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
                            'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#managed-psa',
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
              <CardActions>
                <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                  <Grid item xs={12} md={6} lg={4} ml={2}>
                    <Stack direction="row" spacing={2} pb={1}>
                      <Typography variant="h4">PSA Sequences</Typography>
                      <InfoTwoToneIcon
                        onClick={() =>
                          window.open(
                            'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#psa-sequences',
                            '_blank',
                            'noreferrer'
                          )
                        }
                        fontSize="small"
                      />
                    </Stack>
                    <Typography component="div" variant="caption">
                      These are the PSA sequences you want to be played. Multiple sequences can be selected and will be played through in the
                      order of selection.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Autocomplete
                      multiple
                      disableCloseOnSelect
                      filterSelectedOptions
                      options={psaOptions}
                      getOptionLabel={(psaSequence) => psaSequence.label}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      value={selectedPsaOptions}
                      renderInput={(params) => <TextField {...params} />}
                      onChange={handlePsaSequencesChange}
                    />
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
                            'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#psa-frequency',
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
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#check-viewer-present',
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
                            'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#viewer-present-mode',
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
                                'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#show-location',
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
                              label="Detected Latitude"
                              type="text"
                              value={currentLatitude}
                              onChange={(e) => setCurrentLatitude(e?.target?.value)}
                            />
                          </Grid>
                          <Grid item xs={11} md={5} lg={5}>
                            <TextField
                              fullWidth
                              label="Detected Longitude"
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
                                'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#check-radius-in-miles',
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
                                'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#location-code',
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
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#hide-sequence-after-played',
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
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#block-viewer-ip-addresses',
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
