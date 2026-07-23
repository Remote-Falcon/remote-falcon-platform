import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';

import { useLazyQuery } from '@apollo/client';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { IconArrowLeft, IconExternalLink, IconRoute, IconX } from '@tabler/icons-react';
import { Helmet } from 'react-helmet';
import { Link as RouterLink } from 'react-router-dom';

import Logo from '../../../design-system/components/Logo';
import ThemeToggle from '../../../design-system/components/ThemeToggle';
import ShowsMapLibre from '../../../ui-component/maps/ShowsMapLibre';
import { trackPosthogEvent } from '../../../utils/analytics/posthog';
import { SHOWS_ON_MAP } from '../../../utils/graphql/controlPanel/queries';
import { getShowPublicUrl } from '../../../utils/showPublicUrl';

import FallbackList from './FallbackList';

// Public, unauthenticated shows map (PRD: Public Show Map). Every show that
// opted in via preferences.showOnMap renders as a clustered pin; tapping a
// pin opens a details panel with a viewer-page link and directions.
const MapPage = () => {
  const mapApiRef = useRef(null);
  const detailsCardRef = useRef(null);
  const searchInputRef = useRef(null);
  const [shows, setShows] = useState([]);
  const [totalShows, setTotalShows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queryFailed, setQueryFailed] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedShow, setSelectedShow] = useState(null);

  const [showsOnMapQuery] = useLazyQuery(SHOWS_ON_MAP);

  useEffect(() => {
    trackPosthogEvent('public_map_opened');
    showsOnMapQuery({
      context: { headers: { Route: 'Control-Panel' } },
      fetchPolicy: 'network-only',
      onCompleted: (data) => {
        const loaded = (data?.showsOnAMap?.shows || [])
          .map((show) => ({
            showName: show?.showName,
            showSubdomain: show?.showSubdomain,
            latitude: Number(show?.showLatitude),
            longitude: Number(show?.showLongitude)
          }))
          .filter((show) => Number.isFinite(show.latitude) && Number.isFinite(show.longitude));
        setShows(loaded);
        setTotalShows(data?.showsOnAMap?.totalShows ?? null);
        setLoading(false);
      },
      onError: (error) => {
        // A backend/GraphQL outage on the flagship public page would otherwise
        // be invisible in PostHog (visitors still emit public_map_opened) —
        // capture it explicitly so a launch-week outage is observable.
        setQueryFailed(true);
        setLoading(false);
        trackPosthogEvent('public_map_query_failed', { message: error?.message });
      }
    });
  }, [showsOnMapQuery]);

  const handleMapError = useCallback((error, reason) => {
    setMapFailed(true);
    // reason ('webgl' | 'style_load') separates an unsupported device from a
    // tile-provider outage — a Protomaps quota cutoff must be distinguishable
    // from an old iPad during launch week.
    trackPosthogEvent('public_map_fallback_shown', { reason, message: error?.message });
  }, []);

  const handlePinClick = useCallback((show) => {
    setSelectedShow(show);
    trackPosthogEvent('public_map_pin_clicked', { show_subdomain: show.showSubdomain });
  }, []);

  const handleSearchSelect = useCallback((event, show) => {
    if (!show) return;
    setSelectedShow(show);
    mapApiRef.current?.flyTo({ center: [show.longitude, show.latitude], zoom: 12 });
    trackPosthogEvent('public_map_search_used', { show_subdomain: show.showSubdomain });
  }, []);

  const handleGeolocate = useCallback(() => {
    trackPosthogEvent('public_map_geolocation_used');
  }, []);

  const handleShowPageClick = useCallback((show) => {
    trackPosthogEvent('public_map_show_page_clicked', { show_subdomain: show.showSubdomain });
  }, []);

  // Close the details panel and return focus to the search input so keyboard
  // and screen-reader users don't lose focus to <body> when the card unmounts.
  const closeDetails = useCallback(() => {
    setSelectedShow(null);
    searchInputRef.current?.focus();
  }, []);

  // Dismiss the details panel with ESC (keyboard reachability, PRD NFR-13).
  useEffect(() => {
    if (!selectedShow) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeDetails();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedShow, closeDetails]);

  // Move focus into the details card when it opens so a screen reader
  // announces the dialog + show name (the card can open from a keyboard
  // search-select, which otherwise gives no feedback that a panel appeared).
  useEffect(() => {
    if (selectedShow && !mapFailed) {
      detailsCardRef.current?.focus();
    }
  }, [selectedShow, mapFailed]);

  const sortedShows = useMemo(() => [...shows].sort((a, b) => (a.showName || '').localeCompare(b.showName || '')), [shows]);

  const showViewerUrl = selectedShow ? getShowPublicUrl(selectedShow.showSubdomain) : null;
  const directionsUrl = selectedShow
    ? `https://www.google.com/maps/dir/?api=1&destination=${selectedShow.latitude},${selectedShow.longitude}`
    : null;

  return (
    <Box data-testid="public-map-root" sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Helmet>
        <title>Remote Falcon | Show Map</title>
        <meta name="description" content="Find Remote Falcon light shows near you and jump straight to their viewer pages." />
      </Helmet>

      <Stack
        direction="row"
        alignItems="center"
        spacing={{ xs: 1, sm: 2 }}
        sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexWrap: 'wrap', rowGap: 1 }}
      >
        <Box component={RouterLink} to="/" sx={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center' }}>
          <Logo />
        </Box>
        <Button
          component={RouterLink}
          to="/"
          size="small"
          color="inherit"
          startIcon={<IconArrowLeft size={16} />}
          sx={{ color: 'text.secondary', textTransform: 'none', flexShrink: 0 }}
        >
          Return to Homepage
        </Button>
        <Chip
          size="small"
          label={
            loading
              ? '…'
              : Number.isFinite(totalShows) && totalShows > 0
                ? `${totalShows.toLocaleString()} shows run on Remote Falcon · ${shows.length.toLocaleString()} shared publicly below`
                : `${shows.length} shows`
          }
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        />
        <Box sx={{ flex: 1 }} />
        <Autocomplete
          size="small"
          options={sortedShows}
          getOptionLabel={(option) => option.showName || ''}
          onChange={handleSearchSelect}
          disabled={mapFailed}
          sx={{ width: { xs: '100%', sm: 280 }, order: { xs: 3, sm: 0 } }}
          renderInput={(params) => <TextField {...params} label="Search shows" inputRef={searchInputRef} />}
        />
        <ThemeToggle />
      </Stack>

      <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            <CircularProgress />
          </Box>
        )}

        {queryFailed && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, p: 3 }}>
            <Typography variant="h4" color="text.secondary" align="center">
              We couldn&apos;t load the shows right now. Please try again in a few minutes.
            </Typography>
          </Box>
        )}

        {mapFailed ? (
          <FallbackList shows={shows} onShowClick={handleShowPageClick} />
        ) : (
          <ShowsMapLibre
            ref={mapApiRef}
            shows={shows}
            onPinClick={handlePinClick}
            onGeolocate={handleGeolocate}
            onError={handleMapError}
          />
        )}

        {selectedShow && !mapFailed && (
          <Card
            elevation={8}
            ref={detailsCardRef}
            tabIndex={-1}
            role="dialog"
            aria-modal={false}
            aria-label={`${selectedShow.showName} — show details`}
            sx={{
              position: 'absolute',
              zIndex: 3,
              left: { xs: 0, sm: 16 },
              right: { xs: 0, sm: 'auto' },
              bottom: { xs: 0, sm: 16 },
              width: { xs: '100%', sm: 360 },
              borderRadius: { xs: '12px 12px 0 0', sm: 2 }
            }}
          >
            <CardContent sx={{ pb: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Typography variant="h4" sx={{ overflowWrap: 'anywhere' }}>
                  {selectedShow.showName}
                </Typography>
                <IconButton size="small" aria-label="Close show details" onClick={closeDetails}>
                  <IconX size={18} />
                </IconButton>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  size="small"
                  endIcon={<IconExternalLink size={16} />}
                  component="a"
                  href={showViewerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleShowPageClick(selectedShow)}
                >
                  Visit Show Page
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  endIcon={<IconRoute size={16} />}
                  component="a"
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get Directions
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
};

export default MapPage;
