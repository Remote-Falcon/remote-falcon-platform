import { useCallback, useEffect, useState } from 'react';
import * as React from 'react';

import { useLazyQuery, useMutation } from '@apollo/client';
import { Box, Button, Chip, Grid, Stack, Typography, Switch, CardActions, TextField, IconButton, Tooltip } from '@mui/material';
import MyLocationTwoToneIcon from '@mui/icons-material/MyLocationTwoTone';
import SaveTwoToneIcon from '@mui/icons-material/SaveTwoTone';
import { IconExternalLink } from '@tabler/icons-react';
import _ from 'lodash';

import { useDispatch, useSelector } from '../../../../store';
import { gridSpacing } from '../../../../store/constant';
import MainCard from '../../../../ui-component/cards/MainCard';
import ShowsMapLibre from '../../../../ui-component/maps/ShowsMapLibre';
import PageHead from '../../../../ui-component/PageHead';
import TrackerSkeleton from '../../../../ui-component/cards/Skeleton/TrackerSkeleton';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import { setShow } from '../../../../store/slices/show';
import { UPDATE_PREFERENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { SHOWS_ON_MAP_FOR_USERS } from '../../../../utils/graphql/controlPanel/queries';
import { getShowPublicUrl } from '../../../../utils/showPublicUrl';
import { showAlert } from '../../globalPageHelpers';

const ShowsMap = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [isLoading, setIsLoading] = useState(false);
  const [showsOnMap, setShowsOnMap] = useState([]);
  const [totalShows, setTotalShows] = useState(null);
  const [selectedShow, setSelectedShow] = useState(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);
  const [showsOnMapQuery] = useLazyQuery(SHOWS_ON_MAP_FOR_USERS);

  const detectLocation = useCallback(
    (notify = false) => {
      if (!('geolocation' in navigator)) {
        if (notify) {
          showAlert(dispatch, { alert: 'warning', message: 'Location is not supported by this browser' });
        }
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const showLatitude = parseFloat(position.coords.latitude.toFixed(5));
          const showLongitude = parseFloat(position.coords.longitude.toFixed(5));
          if (showLatitude === 0 || showLongitude === 0) {
            if (notify) {
              showAlert(dispatch, { alert: 'warning', message: 'Location cannot be accurately detected' });
            }
            return;
          }
          setManualLat(String(showLatitude));
          setManualLng(String(showLongitude));
        },
        (error) => {
          // Without an error callback this failed silently. Surface the real
          // reason; the owner can still type coordinates into the fields.
          if (!notify) {
            return;
          }
          const messages = {
            1: 'Location permission denied. Allow location for this site and in your OS privacy/location settings, then try again — or type your coordinates.',
            2: 'Your location is currently unavailable. Make sure location services are on, or type your coordinates.',
            3: 'Timed out getting your location. Try again, or type your coordinates.'
          };
          showAlert(dispatch, {
            alert: 'warning',
            message: messages[error?.code] || 'Could not detect your location. Type your coordinates instead.'
          });
        },
        // enableHighAccuracy requests GPS rather than the coarse wifi/IP fix,
        // which is what made detected locations land a mile off.
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
    [dispatch]
  );

  const getShowsOnMap = useCallback(async () => {
    setIsLoading(true);
    await showsOnMapQuery({
      context: {
        headers: {
          Route: 'Control-Panel'
        }
      },
      fetchPolicy: 'network-only',
      onCompleted: (data) => {
        const shows = [];
        _.forEach(data?.showsOnAMapForUsers?.shows, (mappedShow) => {
          const latitude = Number(mappedShow?.showLatitude);
          const longitude = Number(mappedShow?.showLongitude);
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            shows.push({
              showName: mappedShow?.showName,
              showSubdomain: mappedShow?.showSubdomain,
              publiclyVisible: mappedShow?.publiclyVisible === true,
              latitude,
              longitude
            });
          }
        });
        setShowsOnMap(shows);
        setTotalShows(data?.showsOnAMapForUsers?.totalShows ?? null);
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    });
    setIsLoading(false);
  }, [dispatch, showsOnMapQuery]);

  // Two independent visibility tiers (two switches): showOnMap = visible to
  // logged-in RF users on this page; showOnMapPublic = visible to anyone on
  // the unauthenticated public /map page. Coordinates are set via the Show
  // Location controls below, so enabling either toggle no longer depends on
  // a successful detection at toggle time.
  const handleVisibilitySwitch = (field) => (event, value) => {
    const updatedPreferences = _.cloneDeep({
      ...show?.preferences,
      [field]: value
    });
    savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
      dispatch(
        setShow({
          ...show,
          preferences: {
            ...updatedPreferences
          }
        })
      );
      showAlert(dispatch, response?.toast);
      getShowsOnMap();
    });
  };

  const saveShowLocation = (lat, lng) => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || (latNum === 0 && lngNum === 0)) {
      showAlert(dispatch, { alert: 'warning', message: 'Enter a valid latitude and longitude' });
      return;
    }
    const updatedPreferences = _.cloneDeep({
      ...show?.preferences,
      showLatitude: latNum,
      showLongitude: lngNum
    });
    savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
      dispatch(
        setShow({
          ...show,
          preferences: {
            ...updatedPreferences
          }
        })
      );
      showAlert(dispatch, response?.toast);
      getShowsOnMap();
    });
  };

  useEffect(() => {
    getShowsOnMap();
  }, [getShowsOnMap]);

  // Seed the manual lat/lng fields from the saved show location so the owner
  // edits from the current value rather than a blank field.
  useEffect(() => {
    const lat = show?.preferences?.showLatitude;
    const lng = show?.preferences?.showLongitude;
    if (Number.isFinite(lat)) setManualLat(String(lat));
    if (Number.isFinite(lng)) setManualLng(String(lng));
  }, [show?.preferences?.showLatitude, show?.preferences?.showLongitude]);

  return (
    <Box data-testid="shows-map-root">
      <PageHead
        title="Shows Map"
        description="See other Remote Falcon shows on the map. Opt in to share your show's location."
      />
      <Grid container spacing={gridSpacing}>
        <Grid item xs={12}>
          <MainCard content={false}>
            {isLoading ? (
              <TrackerSkeleton />
            ) : (
              <>
                <CardActions>
                  <Grid container alignItems="center" justifyContent="space-between" spacing={1}>
                    <Grid item xs={12} md={6} lg={4}>
                      <Stack direction="row" spacing={2} pb={1}>
                        <Typography variant="h4">Show {show?.showName} to Remote Falcon users</Typography>
                      </Stack>
                      <Typography component="div" variant="caption">
                        If enabled, {show?.showName}&apos;s location appears on this community Shows Map, visible only to people with a
                        Remote Falcon login.
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                      <Switch
                        name="displayShowOnMap"
                        color="primary"
                        checked={show?.preferences?.showOnMap}
                        onChange={handleVisibilitySwitch('showOnMap')}
                      />
                    </Grid>
                  </Grid>
                </CardActions>
                <CardActions>
                  <Grid container alignItems="center" justifyContent="space-between" spacing={1}>
                    <Grid item xs={12} md={6} lg={4}>
                      <Stack direction="row" spacing={2} pb={1}>
                        <Typography variant="h4">Show {show?.showName} on the public map</Typography>
                      </Stack>
                      <Typography component="div" variant="caption">
                        If enabled, {show?.showName} appears on the public Show Map at remotefalcon.com/map, visible to anyone on the
                        internet with no login required. Your location is blurred to roughly 11 meters (about 36 feet) on both maps.
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                      <Switch
                        name="displayShowOnMapPublic"
                        color="primary"
                        checked={show?.preferences?.showOnMapPublic === true}
                        onChange={handleVisibilitySwitch('showOnMapPublic')}
                      />
                    </Grid>
                  </Grid>
                </CardActions>
                {(show?.preferences?.showOnMap || show?.preferences?.showOnMapPublic) && (
                  <CardActions>
                    <Grid container alignItems="center" justifyContent="space-between" spacing={1}>
                      <Grid item xs={12} md={6} lg={4}>
                        <Typography variant="h4">Show Location</Typography>
                        <Typography component="div" variant="caption">
                          Detect your location or type your coordinates, then save. Tip: in Google Maps, right-click your location and
                          click the latitude/longitude to copy them.
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6} lg={4}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TextField
                            label="Latitude"
                            type="text"
                            size="small"
                            value={manualLat}
                            onChange={(e) => setManualLat(e?.target?.value)}
                          />
                          <TextField
                            label="Longitude"
                            type="text"
                            size="small"
                            value={manualLng}
                            onChange={(e) => setManualLng(e?.target?.value)}
                          />
                          <Tooltip title="Detect my location">
                            <IconButton color="secondary" onClick={() => detectLocation(true)}>
                              <MyLocationTwoToneIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Save location">
                            <IconButton color="primary" onClick={() => saveShowLocation(manualLat, manualLng)}>
                              <SaveTwoToneIcon />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Grid>
                    </Grid>
                  </CardActions>
                )}
                <Box sx={{ mt: 4 }}>
                  <Typography variant="h3" align="center" color="secondary">
                    {Number.isFinite(totalShows) && totalShows > 0
                      ? `${totalShows.toLocaleString()} shows on Remote Falcon, ${showsOnMap?.length?.toLocaleString()} on the community map`
                      : `Total Shows on Map: ${showsOnMap?.length}`}
                  </Typography>
                  {selectedShow && (
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 1 }}>
                      <Typography variant="h5">{selectedShow.showName}</Typography>
                      {selectedShow.publiclyVisible && <Chip size="small" color="success" label="Public" />}
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<IconExternalLink size={16} />}
                        component="a"
                        href={getShowPublicUrl(selectedShow.showSubdomain)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Visit Show
                      </Button>
                    </Stack>
                  )}
                </Box>
                <CardActions sx={{ height: '39em' }}>
                  <ShowsMapLibre shows={showsOnMap} onPinClick={setSelectedShow} />
                </CardActions>
              </>
            )}
          </MainCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ShowsMap;
