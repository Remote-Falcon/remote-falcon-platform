import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as React from 'react';

import { Box } from '@mui/material';
import maplibregl from 'maplibre-gl';
import PropTypes from 'prop-types';

import 'maplibre-gl/dist/maplibre-gl.css';

import useConfig from '../../hooks/useConfig';
import { getMapStyleUrl, getMapTextFont } from '../../utils/maps/mapStyle';

// Continental-US default view for when no shows are loaded yet (matches the
// old Google Maps locator's default center).
const DEFAULT_CENTER = [-97.6458, 41.6919];
const DEFAULT_ZOOM = 3;

// Pin/cluster colors are deliberately fixed rather than theme-derived so
// status colors read the same in light and dark mode (PRD FR-4).
const CLUSTER_COLOR = '#43a047';
const PIN_COLOR = '#e53935';

const SOURCE_ID = 'shows';
const CLUSTER_LAYER = 'show-clusters';
const CLUSTER_COUNT_LAYER = 'show-cluster-counts';
const PIN_LAYER = 'show-pins';

const toGeoJson = (shows) => ({
  type: 'FeatureCollection',
  features: (shows || [])
    .filter((show) => Number.isFinite(show?.latitude) && Number.isFinite(show?.longitude))
    .map((show) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [show.longitude, show.latitude] },
      properties: { showName: show.showName, showSubdomain: show.showSubdomain, publiclyVisible: show.publiclyVisible === true }
    }))
});

const boundsOf = (geojson) => {
  if (!geojson.features.length) return null;
  const bounds = new maplibregl.LngLatBounds();
  geojson.features.forEach((feature) => bounds.extend(feature.geometry.coordinates));
  return bounds;
};

/**
 * Shared MapLibre GL shows map: clustered pins for every publicly-listed show.
 * Used by the public /map page and the control panel's Shows Map page.
 *
 * - Basemap style comes from getMapStyleUrl (Protomaps hosted API in v1,
 *   env-swappable to self-hosted tiles — PRD FR-35).
 * - Follows the site-wide navType (dark/light) live: theme toggles call
 *   map.setStyle and the pin source/layers are re-added on `style.load`
 *   because setStyle wipes user-added layers.
 * - Clustering is MapLibre-native (`cluster: true`); clicking a cluster zooms
 *   into it, clicking a pin calls onPinClick with the show's properties.
 *
 * Ref API: flyTo(options), fitToShows().
 */
const ShowsMapLibre = forwardRef(({ shows, onPinClick, onGeolocate, onError, sx }, ref) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const fittedRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const { navType } = useConfig();

  const geojson = useMemo(() => toGeoJson(shows), [shows]);

  // Kept in refs so the map's event handlers (bound once) always see the
  // latest data and callbacks without re-creating the map.
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;
  const navTypeRef = useRef(navType);
  navTypeRef.current = navType;
  const onPinClickRef = useRef(onPinClick);
  onPinClickRef.current = onPinClick;
  const onGeolocateRef = useRef(onGeolocate);
  onGeolocateRef.current = onGeolocate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const ensureShowLayers = useCallback((map) => {
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojsonRef.current,
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 50
      });
    }
    if (!map.getLayer(CLUSTER_LAYER)) {
      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': CLUSTER_COLOR,
          'circle-radius': ['step', ['get', 'point_count'], 16, 25, 22, 100, 28],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
    }
    if (!map.getLayer(CLUSTER_COUNT_LAYER)) {
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': getMapTextFont(navTypeRef.current),
          'text-size': 13
        },
        paint: { 'text-color': '#ffffff' }
      });
    }
    if (!map.getLayer(PIN_LAYER)) {
      map.addLayer({
        id: PIN_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': PIN_COLOR,
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      });
    }
  }, []);

  // Create the map once.
  useEffect(() => {
    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: getMapStyleUrl(navType),
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM
      });
    } catch (error) {
      // Typically no-WebGL. The caller renders the list fallback.
      onErrorRef.current?.(error);
      return undefined;
    }
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      fitBoundsOptions: { maxZoom: 11 }
    });
    map.addControl(geolocate, 'top-right');
    geolocate.on('geolocate', () => onGeolocateRef.current?.());

    // Fires on initial load AND after every setStyle (theme switches), which
    // wipe user-added sources/layers.
    map.on('style.load', () => {
      loadedOnceRef.current = true;
      ensureShowLayers(map);
    });

    // A fatal error before the style ever loads (bad style URL, network down)
    // means no basemap at all — escalate so the page can fall back to the
    // list view. Tile errors after a successful load are non-fatal noise.
    map.on('error', (event) => {
      if (!loadedOnceRef.current) {
        onErrorRef.current?.(event?.error || new Error('Map failed to load'));
      }
    });

    map.on('click', CLUSTER_LAYER, async (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      try {
        const zoom = await map.getSource(SOURCE_ID).getClusterExpansionZoom(feature.properties.cluster_id);
        map.easeTo({ center: feature.geometry.coordinates, zoom });
      } catch {
        // Cluster dissolved between render and click (data refresh) — the
        // expansion-zoom lookup rejects; nothing to zoom to.
      }
    });

    map.on('click', PIN_LAYER, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const [longitude, latitude] = feature.geometry.coordinates;
      onPinClickRef.current?.({ ...feature.properties, latitude, longitude });
    });

    [CLUSTER_LAYER, PIN_LAYER].forEach((layer) => {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // The map is created exactly once; navType changes are handled by the
    // setStyle effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live theme switching (PRD FR-4a): swap the style in place; pins and
  // viewport survive because ensureShowLayers re-runs on style.load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedOnceRef.current) return;
    map.setStyle(getMapStyleUrl(navType));
  }, [navType]);

  // Push data updates into the existing source; fit the viewport to the
  // shows the first time real data arrives (PRD FR-2).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getSource(SOURCE_ID)?.setData(geojson);
    if (!fittedRef.current && geojson.features.length) {
      const bounds = boundsOf(geojson);
      if (bounds) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 10, animate: false });
        fittedRef.current = true;
      }
    }
  }, [geojson]);

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (options) => mapRef.current?.flyTo(options),
      fitToShows: () => {
        const bounds = boundsOf(geojsonRef.current);
        if (bounds) mapRef.current?.fitBounds(bounds, { padding: 48, maxZoom: 10 });
      }
    }),
    []
  );

  return <Box ref={containerRef} data-testid="shows-maplibre" sx={{ width: '100%', height: '100%', ...sx }} />;
});

ShowsMapLibre.propTypes = {
  shows: PropTypes.arrayOf(
    PropTypes.shape({
      showName: PropTypes.string,
      showSubdomain: PropTypes.string,
      publiclyVisible: PropTypes.bool,
      latitude: PropTypes.number,
      longitude: PropTypes.number
    })
  ),
  onPinClick: PropTypes.func,
  onGeolocate: PropTypes.func,
  onError: PropTypes.func,
  sx: PropTypes.object
};

export default ShowsMapLibre;
