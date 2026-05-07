import { useCallback, useEffect, useRef, useState } from 'react';
import * as React from 'react';

import { useLazyQuery, useMutation } from '@apollo/client';
import { Box, Grid, Stack, Typography, Switch, CardActions } from '@mui/material';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import _ from 'lodash';

/* global google */

import { useDispatch, useSelector } from '../../../../store';
import { gridSpacing } from '../../../../store/constant';
import MainCard from '../../../../ui-component/cards/MainCard';
import TrackerSkeleton from '../../../../ui-component/cards/Skeleton/TrackerSkeleton';

import { savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import { setShow } from '../../../../store/slices/show';
import RFLoadingButton from '../../../../ui-component/RFLoadingButton';
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
    if (!map || !markerLib) return;
    clustererRef.current = new MarkerClusterer({ map, markers: [] });
    return () => {
      clustererRef.current?.clearMarkers();
      clustererRef.current = null;
    };
  }, [map, markerLib]);

  useEffect(() => {
    if (!map || !markerLib || !clustererRef.current) return;
    const { AdvancedMarkerElement } = markerLib;
    const infoWindow = infoWindowRef.current ?? new google.maps.InfoWindow();
    const mapClickListener = map.addListener('click', () => infoWindow.close());

    // clear existing markers before adding new ones
    clustererRef.current.clearMarkers();

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

    clustererRef.current.addMarkers(markers);

    return () => {
      google.maps.event.removeListener(mapClickListener);
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
  const [detectedLocation, setDetectedLocation] = useState({ lat: 0, long: 0 });

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);
  const [showsOnMapQuery] = useLazyQuery(SHOWS_ON_MAP);

  const detectLocation = useCallback(async () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const showLatitude = parseFloat(position.coords.latitude.toFixed(5));
        const showLongitude = parseFloat(position.coords.longitude.toFixed(5));
        if (showLatitude === 0 || showLongitude === 0) {
          showAlert(dispatch, { alert: 'warning', message: 'Location cannot be accurately detected' });
          return;
        }
        setDetectedLocation({ lat: showLatitude, long: showLongitude });
      });
    } else {
      showAlert(dispatch, { alert: 'warning', message: 'Location is not enabled' });
    }
  }, [dispatch]);

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
    if (value) {
      let showLatitude = show?.preferences?.showLatitude;
      let showLongitude = show?.preferences?.showLongitude;
      const hasValidExistingCoords =
        Number.isFinite(showLatitude) &&
        Number.isFinite(showLongitude) &&
        !(showLatitude === 0 && showLongitude === 0);
      if (!hasValidExistingCoords) {
        if (detectedLocation.lat === 0 || detectedLocation.long === 0) {
          showAlert(dispatch, {
            alert: 'warning',
            message: 'Location cannot be accurately detected. Please enable location services and try again.'
          });
          return;
        }
        showLatitude = detectedLocation.lat;
        showLongitude = detectedLocation.long;
      }
      const updatedPreferences = _.cloneDeep({
        ...show?.preferences,
        showOnMap: value,
        showLatitude,
        showLongitude
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
    } else {
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
    }
  };

  const updateToDetectedLocation = () => {
    if (detectedLocation.lat === 0 || detectedLocation.long === 0) {
      showAlert(dispatch, { alert: 'warning', message: 'Location cannot be accurately detected' });
      return;
    }
    const updatedPreferences = _.cloneDeep({
      ...show?.preferences,
      showLatitude: detectedLocation.lat,
      showLongitude: detectedLocation.long
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
    detectLocation();
    getShowsOnMap();
  }, [detectLocation, getShowsOnMap]);

  return (
    <Box sx={{ mt: 2 }}>
      <Grid container spacing={gridSpacing}>
        <Grid item xs={12}>
          <MainCard title="Remote Falcon Shows Map" content={false}>
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
                        <Typography variant="h4" display="inline">
                          Current Show Location:
                          <Typography variant="h4" display="inline" color="primary" ml={1}>
                            {show?.preferences?.showLatitude}, {show?.preferences?.showLongitude}
                          </Typography>
                        </Typography>
                        <Typography variant="h4">
                          Detected Location:
                          <Typography variant="h4" display="inline" color="primary" ml={5.2}>
                            {detectedLocation.lat}, {detectedLocation.long}
                          </Typography>
                        </Typography>
                        <Typography component="div" variant="caption">
                          If your show location on the map is not accurate, click Update to Detected Location to set your shows location to
                          the current detected location.
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6} lg={4}>
                        <RFLoadingButton onClick={updateToDetectedLocation} color="primary" disabled={!show?.preferences?.showOnMap}>
                          Update to Detected Location
                        </RFLoadingButton>
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
