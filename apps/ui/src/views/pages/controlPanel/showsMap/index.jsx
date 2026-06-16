import { useCallback, useEffect, useRef, useState } from 'react';
import * as React from 'react';

import { useLazyQuery, useMutation } from '@apollo/client';
import { Box, Grid, Stack, Typography, Switch, CardActions, TextField, IconButton, Tooltip } from '@mui/material';
import MyLocationTwoToneIcon from '@mui/icons-material/MyLocationTwoTone';
import SaveTwoToneIcon from '@mui/icons-material/SaveTwoTone';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import _ from 'lodash';

/* global google */

import { useDispatch, useSelector } from '../../../../store';
import { gridSpacing } from '../../../../store/constant';
import MainCard from '../../../../ui-component/cards/MainCard';
import PageHead from '../../../../ui-component/PageHead';
import TrackerSkeleton from '../../../../ui-component/cards/Skeleton/TrackerSkeleton';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import { setShow } from '../../../../store/slices/show';
import { UPDATE_PREFERENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { SHOWS_ON_MAP } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';
const ShowsCluster = ({ shows }) => {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');
  const infoWindowRef = useRef(null);
  const clustererRef = useRef(null);

  useEffect(() => {
    if (!markerLib || infoWindowRef.current) return;
    infoWindowRef.current = new google.maps.InfoWindow();
  }, [markerLib]);

  useEffect(() => {
    if (!map || !markerLib) return undefined;
    const { AdvancedMarkerElement } = markerLib;
    const infoWindow = infoWindowRef.current ?? new google.maps.InfoWindow();
    const mapClickListener = map.addListener('click', () => infoWindow.close());

    const markers = shows
      .filter((show) => Number.isFinite(show?.location?.lat) && Number.isFinite(show?.location?.lng))
      .map((show) => {
        const title = show?.showName || 'Show';
        const marker = new AdvancedMarkerElement({
          position: show.location,
          title
        });
        marker.addListener('click', () => {
          infoWindow.close();
          const content = document.createElement('div');
          content.textContent = title;
          content.style.color = '#0d47a1';
          content.style.fontWeight = '600';
          content.style.fontSize = '14px';
          content.style.padding = '4px 8px';
          infoWindow.setContent(content);
          infoWindow.open({ anchor: marker, map });
        });
        return marker;
      });

    // Construct the clusterer with markers already populated. The
    // previous split-effect implementation (empty-init then addMarkers)
    // is a known sharp edge in @googlemaps/markerclusterer v2.5+ when
    // paired with AdvancedMarkerElement — the renderer is left in a
    // state where the first addMarkers() call silently produces no DOM
    // output, with no console error. Result: ~1,040 valid markers
    // entered the cluster but zero <gmp-advanced-marker> elements ever
    // appeared in the DOM (#117).
    clustererRef.current = new MarkerClusterer({ map, markers });

    return () => {
      google.maps.event.removeListener(mapClickListener);
      clustererRef.current?.clearMarkers();
      clustererRef.current = null;
      markers.forEach((marker) => marker.map && (marker.map = null));
    };
  }, [map, markerLib, shows]);

  return null;
};

const ShowsMap = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [isLoading, setIsLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showsOnMap, setShowsOnMap] = useState([]);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);
  const [showsOnMapQuery] = useLazyQuery(SHOWS_ON_MAP);

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
        _.forEach(data?.showsOnAMap, (show) => {
          const lat = Number(show?.showLatitude);
          const lng = Number(show?.showLongitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            shows.push({
              showName: show?.showName,
              location: { lat, lng }
            });
          }
        });
        setShowsOnMap(shows);
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    });
    setIsLoading(false);
  }, [dispatch, showsOnMapQuery]);

  const handleShowMyShowSwitch = (event, value) => {
    // Just toggle map visibility. The show's coordinates are set via the Show
    // Location controls below (Detect or manual entry), so enabling the map no
    // longer depends on a successful detection at toggle time.
    const updatedPreferences = _.cloneDeep({
      ...show?.preferences,
      showOnMap: value
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

  const center = {
    lat: 41.69194824042432,
    lng: -97.64580975379515
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
                        <Typography variant="h4">Show {show?.showName} on the Map</Typography>
                      </Stack>
                      <Typography component="div" variant="caption">
                        If enabled, {show?.showName}&apos;s location will be displayed on the Remote Falcon Shows Map.
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                      <Switch
                        name="displayShowOnMap"
                        color="primary"
                        checked={show?.preferences?.showOnMap}
                        onChange={handleShowMyShowSwitch}
                      />
                    </Grid>
                  </Grid>
                </CardActions>
                {show?.preferences?.showOnMap && (
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
                    Total Shows on Map: {showsOnMap?.length}
                  </Typography>
                </Box>
                <CardActions sx={{ height: '39em' }}>
                  <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_KEY} onLoad={() => setMapLoaded(true)}>
                    {mapLoaded && (
                      <Map mapId="972618e58193992a" defaultZoom={1} defaultCenter={center}>
                        <ShowsCluster shows={showsOnMap} />
                      </Map>
                    )}
                  </APIProvider>
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
