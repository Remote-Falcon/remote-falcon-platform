/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { TextField } from '@mui/material';
import newAxios from 'axios';
import htmlToReact from 'html-to-react';
import loadjs from 'loadjs';
import _ from 'lodash';
import moment from 'moment';
import Loading from 'react-fullscreen-loading';
import { Helmet } from 'react-helmet';

import useInterval from '../../../hooks/useInterval';
import { useDispatch } from '../../../store';
import { getSubdomain } from '../../../utils/route-guard/helpers/helpers';
import { trackPosthogEvent } from '../../../utils/analytics/posthog';

import { addSequenceToQueueService, voteForSequenceService } from '../../../services/viewer/mutations.service';
import { getViewerId } from '../../../utils/viewerId';
import { LocationCheckMethod, ViewerControlMode } from '../../../utils/enum';
import { ADD_SEQUENCE_TO_QUEUE, INSERT_VIEWER_PAGE_STATS, VOTE_FOR_SEQUENCE } from '../../../utils/graphql/viewer/mutations';
import { GET_ACTIVE_VIEWER_PAGE, GET_SHOW_FOR_VIEWER, VOTES_REMAINING } from '../../../utils/graphql/viewer/queries';
import { showAlert } from '../globalPageHelpers';
import { orderSequencesByCategory } from './helpers/categoryOrder';
import LocationRecoveryControl from './LocationRecoveryControl';
import { LocationPermission, acquireViewerLocation, clientClassFromUserAgent } from './helpers/locationPermission';
import {
  defaultProcessingInstructions,
  injectInlineRetryLocationToken,
  injectRetryLocationToken,
  nextNowPlayingState,
  processingInstructions,
  sequenceImage,
  viewerPageMessageElements
} from './helpers/helpers';

// Both are stateless factories — `parseWithInstructions` takes the instruction
// set per call, so nothing here carries state between parses. They used to be
// allocated inside convertViewerPageToReact, i.e. twice a second forever.
const htmlToReactParser = new htmlToReact.Parser();
const processNodeDefinitions = new htmlToReact.ProcessNodeDefinitions(React);

const ExternalViewerPage = () => {
  const dispatch = useDispatch();

  const blockRedirectReferrers = ['https://player.pulsemesh.io/'];
  const viewerScriptsBasePath = '/viewer-scripts/';

  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState();
  const [activeViewerPage, setActiveViewerPage] = useState();

  const [remoteViewerReactPage, setRemoteViewerReactPage] = useState(null);
  // PRD-019 — the last acquired fix lives in a ref, not state. The mutation
  // callbacks read it synchronously right after awaiting a fresh fix, and a
  // `useState` value cannot be read back within the same tick it was set: the
  // callback closes over the render's value. That is exactly how the old code
  // sent 0.0/0.0 on a viewer's first tap. Nothing renders from these, so state
  // bought nothing and cost correctness.
  const viewerCoordsRef = useRef(null);
  // The location wait is now genuinely asynchronous (up to the 10s timeout on a
  // cold fix), where it used to return instantly. Without a guard an impatient
  // double-tap fires two mutations, and the loser is logged as a rejected
  // request — inflating the very funnel this work exists to clean up.
  const requestInFlightRef = useRef(false);
  const locationPermissionRef = useRef(LocationPermission.UNKNOWN);
  // PRD-019 — the ref is what the mutation path reads synchronously; this is
  // what the recovery control renders from. Both, because a ref can't trigger a
  // re-render and state can't be read back in the tick it was set.
  //
  // Starts UNKNOWN and STAYS unknown until the load-time call resolves, which
  // renders nothing. That gate is deliberate: on load the permission state is
  // `prompt` until the viewer answers the dialog the page itself raised, so
  // rendering on "not granted" would flash the control at every viewer —
  // control appears, dialog appears, viewer allows, control vanishes. Waiting
  // confines it to viewers who genuinely cannot request.
  const [locationPermission, setLocationPermission] = useState(LocationPermission.UNKNOWN);
  const [enteredLocationCode, setEnteredLocationCode] = useState(null);
  const [messageDisplayTime] = useState(6000);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [nowPlayingTimer, setNowPlayingTimer] = useState(0);
  // #162 — votes this viewer has left in the current show session (null = no cap
  // configured or exempt → the {VOTES_REMAINING} slot renders empty).
  const [votesRemaining, setVotesRemaining] = useState(null);

  const [getShowQuery] = useLazyQuery(GET_SHOW_FOR_VIEWER);
  const [getActiveViewerPageQuery] = useLazyQuery(GET_ACTIVE_VIEWER_PAGE);
  const [getVotesRemainingQuery] = useLazyQuery(VOTES_REMAINING);
  const [insertViewerPageStatsMutation] = useMutation(INSERT_VIEWER_PAGE_STATS);
  const [addSequenceToQueueMutation] = useMutation(ADD_SEQUENCE_TO_QUEUE);
  const [voteForSequenceMutation] = useMutation(VOTE_FOR_SEQUENCE);

  // Polling query for continuous updates
  const { data: pollingData } = useQuery(GET_SHOW_FOR_VIEWER, {
    context: {
      headers: {
        Route: 'Viewer'
      }
    },
    variables: {
      showSubdomain: getSubdomain()
    },
    pollInterval: 5000,
    skip: loading, // Skip polling during initial load
    notifyOnNetworkStatusChange: true,
    onError: () => {
      showAlert(dispatch, { alert: 'error' });
    }
  });

  /**
   * PRD-019 — acquire the viewer's position and report what happened.
   *
   * The previous version was `async` but wrapped the callback-based
   * `getCurrentPosition` without promisifying it and without an error callback.
   * Two bugs fell out of that:
   *
   * 1. `await setViewerLocation()` resolved IMMEDIATELY, before any fix
   *    existed, so the mutation right after it sent `viewerLatitude || 0.0`
   *    from a stale closure. Any viewer whose permission resolved at tap time
   *    rather than load time got INVALID_LOCATION on their FIRST request and
   *    success on the second.
   * 2. With no error callback the page had zero knowledge of permission state,
   *    which is why no recovery UI could exist and why INVALID_LOCATION
   *    conflates "denied the prompt" with "genuinely too far away".
   *
   * Resolves with the coordinates (or `null`) so callers use the value they
   * just awaited instead of re-reading React state, and records the permission
   * outcome on the way through.
   *
   * @param {'load'|'request'} trigger  where the call came from, for the event
   * @returns {Promise<{latitude: string, longitude: string} | null>}
   */
  const setViewerLocation = useCallback(async (trigger = 'load') => {
    const clientClass = clientClassFromUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent);
    const { permission, coords } = await acquireViewerLocation(typeof navigator === 'undefined' ? undefined : navigator, (state) =>
      trackPosthogEvent('viewer_location_permission', { state, trigger, client_class: clientClass })
    );
    locationPermissionRef.current = permission;
    setLocationPermission(permission);
    if (coords) {
      viewerCoordsRef.current = coords;
    }
    return coords;
  }, []);

  /**
   * PRD-019 — user-initiated re-prompt.
   *
   * Gesture-initiated, never programmatic. Chrome quiet-blocks an origin after
   * repeated dismissals, so an auto-retry loop would break the exact viewers it
   * was trying to help. It is also MORE reliable than the load-time call at
   * actually surfacing the dialog, particularly on iOS Safari — the button is a
   * better prompt trigger than the thing it is recovering from.
   */
  const retryViewerLocation = useCallback(() => {
    setViewerLocation('retry');
  }, [setViewerLocation]);

  /**
   * PRD-019 — tier 1 only. Chrome's <geolocation> element resolves the grant
   * itself and hands us the position, so we record it directly rather than
   * spending a second getCurrentPosition to learn what we already know.
   */
  const acceptElementPosition = useCallback((coords) => {
    viewerCoordsRef.current = {
      latitude: coords.latitude.toFixed(5),
      longitude: coords.longitude.toFixed(5)
    };
    locationPermissionRef.current = LocationPermission.GRANTED;
    setLocationPermission(LocationPermission.GRANTED);
    trackPosthogEvent('viewer_location_permission', {
      state: 'granted',
      trigger: 'element',
      client_class: clientClassFromUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent)
    });
  }, []);

  /**
   * PRD-019 — follow permission changes made OUTSIDE the page.
   *
   * The denied-state copy sends the viewer into browser settings, and without
   * this they would come back to a page still telling them location is blocked.
   * Also covers Chrome's post-dismissal quiet block, which expires on its own
   * after about a week: a repeat visitor across show nights can silently
   * recover, and the page should notice.
   *
   * Does NOT clear a stale `denied`->`granted` transition's coordinates — the
   * next tap re-acquires. The state is only here to decide what to render.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return undefined;
    }
    let status;
    let cancelled = false;
    const onChange = () => {
      const next = status?.state;
      if (cancelled || !next) {
        return;
      }
      locationPermissionRef.current = next;
      setLocationPermission(next);
    };
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (cancelled) {
          return;
        }
        status = result;
        status.addEventListener('change', onChange);
      })
      // Some engines reject the `geolocation` permission name outright. The
      // page works without this; it just won't self-heal.
      .catch(() => {});
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, []);

  // #162 — pull this viewer's remaining session votes for the {VOTES_REMAINING}
  // slot. Called on load and after each vote (not on the 5s poll, to keep the
  // count read off the hot path). `optedIn` decides the identity sent (viewerId
  // vs IP-backstop) so the count matches what the server enforces. Returns null
  // when no cap is set or the IP is exempt → the slot stays empty.
  const refreshVotesRemaining = useCallback(
    (optedIn) => {
      getVotesRemainingQuery({
        context: { headers: { Route: 'Viewer' } },
        variables: {
          showSubdomain: getSubdomain(),
          viewerId: optedIn ? getViewerId() : null
        },
        fetchPolicy: 'network-only',
        onCompleted: (data) => {
          setVotesRemaining(data?.votesRemaining ?? null);
        }
      });
    },
    [getVotesRemainingQuery]
  );

  const showViewerMessage = useCallback(
    (response) => {
      const errorMessage = response?.error?.graphQLErrors[0]?.extensions?.message;
      if (response?.success) {
        viewerPageMessageElements.requestSuccessful.current = viewerPageMessageElements?.requestSuccessful?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Success' });
      } else if (errorMessage === 'NAUGHTY') {
        // Do nothing, say nothing
        trackPosthogEvent('viewer_interaction_result', { result: 'Naughty' });
      } else if (errorMessage === 'SEQUENCE_REQUESTED') {
        viewerPageMessageElements.requestPlaying.current = viewerPageMessageElements?.requestPlaying?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Sequence Already Requested' });
      } else if (errorMessage === 'INVALID_LOCATION') {
        viewerPageMessageElements.invalidLocation.current = viewerPageMessageElements?.invalidLocation?.block;
        // PRD-019 — INVALID_LOCATION has always meant three different things at
        // once: the viewer denied the prompt, the viewer is genuinely outside
        // the radius, or the show's geofence is misconfigured. Only the browser
        // knows which, so carry the permission state on the event. Without this
        // dimension neither we nor the operator can tell a fixable permission
        // problem from a radius that needs widening — and the operator-facing
        // hint has been guessing wrong for as long as it has existed.
        //
        // `out_of_range` is an inference, not an observation: permission was
        // granted and the server still rejected us. A misconfigured show
        // latitude lands here too, which is what the separate zero-success-shows
        // investigation is for.
        trackPosthogEvent('viewer_interaction_result', {
          result: 'Invalid Location',
          location_permission: locationPermissionRef.current,
          cause:
            locationPermissionRef.current === LocationPermission.GRANTED
              ? 'out_of_range'
              : `permission_${locationPermissionRef.current}`,
          client_class: clientClassFromUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent)
        });
      } else if (errorMessage === 'QUEUE_FULL') {
        viewerPageMessageElements.queueFull.current = viewerPageMessageElements?.queueFull?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Queue Full' });
      } else if (errorMessage === 'INVALID_CODE') {
        viewerPageMessageElements.invalidLocationCode.current = viewerPageMessageElements?.invalidLocationCode?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Invalid Code' });
      } else if (errorMessage === 'ALREADY_VOTED') {
        viewerPageMessageElements.alreadyVoted.current = viewerPageMessageElements?.alreadyVoted?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Already Voted' });
      } else if (errorMessage === 'ALREADY_REQUESTED') {
        viewerPageMessageElements.alreadyRequested.current = viewerPageMessageElements?.alreadyRequested?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Viewer Already Requested' });
      } else if (errorMessage === 'DAILY_VOTE_LIMIT_REACHED') {
        viewerPageMessageElements.dailyVoteLimitReached.current = viewerPageMessageElements?.dailyVoteLimitReached?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Daily Vote Limit Reached' });
      } else if (errorMessage === 'SEQUENCE_UNAVAILABLE') {
        viewerPageMessageElements.sequenceUnavailable.current = viewerPageMessageElements?.sequenceUnavailable?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Sequence Unavailable' });
      } else {
        viewerPageMessageElements.requestFailed.current = viewerPageMessageElements?.requestFailed?.block;
        trackPosthogEvent('viewer_interaction_result', { result: 'Failed' });
      }
      setTimeout(() => {
        _.map(viewerPageMessageElements, (message) => {
          message.current = message?.none;
        });
      }, messageDisplayTime);
    },
    [messageDisplayTime]
  );

  const addSequenceToQueue = useCallback(
    async (e) => {
      const sequenceName = e.target.attributes.getNamedItem('data-key') ? e.target.attributes.getNamedItem('data-key').value : '';
      const sequenceDisplayName = e.target.attributes.getNamedItem('data-key-2')
        ? e.target.attributes.getNamedItem('data-key-2').value
        : null;
      trackPosthogEvent('viewer_interaction', {
        action: 'Add Sequence to Queue',
        sequence: sequenceDisplayName != null ? sequenceDisplayName : sequenceName,
        show_name: show?.showName
      });
      if (requestInFlightRef.current) {
        return;
      }
      requestInFlightRef.current = true;
      // PRD-019 — use the coordinates this call resolves with. Reading
      // `viewerLatitude` state back here is what sent 0.0/0.0 on the first tap.
      // Fall back to the last good fix so a viewer who granted on load but hits
      // a transient POSITION_UNAVAILABLE at tap time isn't rejected outright.
      let coords = viewerCoordsRef.current;
      try {
        if (show?.preferences?.enableGeolocation) {
          coords = (await setViewerLocation('request')) ?? viewerCoordsRef.current;
        }
      } finally {
        requestInFlightRef.current = false;
      }
      if (show?.preferences?.locationCheckMethod === LocationCheckMethod.CODE) {
        if (parseInt(enteredLocationCode, 10) !== parseInt(show?.preferences?.locationCode, 10)) {
          const invalidCodeResponse = {
            error: {
              graphQLErrors: [
                {
                  extensions: {
                    message: 'INVALID_CODE'
                  }
                }
              ]
            }
          };
          showViewerMessage(invalidCodeResponse);
          setEnteredLocationCode(null);
          return;
        }
      }
      addSequenceToQueueService(
        addSequenceToQueueMutation,
        getSubdomain(),
        sequenceName,
        coords?.latitude ?? 0.0,
        coords?.longitude ?? 0.0,
        show?.preferences?.analyticsBetaOptIn ? getViewerId() : null,
        // PRD-019 — lets the server split a permission-caused rejection from a
        // genuinely-out-of-range one. Sent on every attempt, not just failures,
        // because the server doesn't know it will reject until the rule runs.
        locationPermissionRef.current,
        (response) => {
          showViewerMessage(response);
        }
      );
    },
    [
      show?.preferences?.enableGeolocation,
      show?.preferences?.locationCheckMethod,
      show?.preferences?.locationCode,
      show?.preferences?.analyticsBetaOptIn,
      addSequenceToQueueMutation,
      setViewerLocation,
      enteredLocationCode,
      showViewerMessage
    ]
  );

  const voteForSequence = useCallback(
    async (e) => {
      const sequenceName = e.target.attributes.getNamedItem('data-key') ? e.target.attributes.getNamedItem('data-key').value : '';
      const sequenceDisplayName = e.target.attributes.getNamedItem('data-key-2')
        ? e.target.attributes.getNamedItem('data-key-2').value
        : null;
      trackPosthogEvent('viewer_interaction', {
        action: 'Vote for Sequence',
        sequence: sequenceDisplayName != null ? sequenceDisplayName : sequenceName,
        show_name: show?.showName
      });
      if (requestInFlightRef.current) {
        return;
      }
      requestInFlightRef.current = true;
      // PRD-019 — use the coordinates this call resolves with. Reading
      // `viewerLatitude` state back here is what sent 0.0/0.0 on the first tap.
      // Fall back to the last good fix so a viewer who granted on load but hits
      // a transient POSITION_UNAVAILABLE at tap time isn't rejected outright.
      let coords = viewerCoordsRef.current;
      try {
        if (show?.preferences?.enableGeolocation) {
          coords = (await setViewerLocation('request')) ?? viewerCoordsRef.current;
        }
      } finally {
        requestInFlightRef.current = false;
      }
      if (show?.preferences?.locationCheckMethod === LocationCheckMethod.CODE) {
        if (parseInt(enteredLocationCode, 10) !== parseInt(show?.preferences?.locationCode, 10)) {
          const invalidCodeResponse = {
            error: {
              graphQLErrors: [
                {
                  extensions: {
                    message: 'INVALID_CODE'
                  }
                }
              ]
            }
          };
          showViewerMessage(invalidCodeResponse);
          setEnteredLocationCode(null);
          return;
        }
      }
      voteForSequenceService(
        voteForSequenceMutation,
        getSubdomain(),
        sequenceName,
        coords?.latitude ?? 0.0,
        coords?.longitude ?? 0.0,
        show?.preferences?.analyticsBetaOptIn ? getViewerId() : null,
        (response) => {
          showViewerMessage(response);
          if (response?.success) {
            // #162 — optimistic decrement for snappy feedback, then reconcile
            // with the server (covers the gap rollover, other tabs/devices on
            // the same IP, and the exact authoritative count).
            setVotesRemaining((prev) => (prev != null ? Math.max(0, prev - 1) : prev));
            refreshVotesRemaining(show?.preferences?.analyticsBetaOptIn);
          }
        }
      );
    },
    [
      show?.preferences?.enableGeolocation,
      show?.preferences?.locationCheckMethod,
      show?.preferences?.locationCode,
      show?.preferences?.analyticsBetaOptIn,
      voteForSequenceMutation,
      setViewerLocation,
      enteredLocationCode,
      showViewerMessage,
      refreshVotesRemaining
    ]
  );

  const delay = useCallback(
    (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    []
  );

  const fetchViewerScripts = useCallback(
    async (attempt = 1) => {
      try {
        const config = {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        };
        const response = await newAxios.get(`${viewerScriptsBasePath}scripts.json`, config);
        if (!Array.isArray(response?.data)) {
          throw new Error('Invalid scripts.json payload');
        }
        return response.data;
      } catch (error) {
        console.warn(`[Viewer] Failed to fetch scripts.json (attempt ${attempt})`, error);
        if (attempt < 3) {
          await delay(attempt * 300);
          return fetchViewerScripts(attempt + 1);
        }
        trackPosthogEvent('viewer_scripts_fetch_failed', {
          attempts: attempt,
          message: error?.message
        });
        throw error;
      }
    },
    [delay, viewerScriptsBasePath]
  );

  const loadViewerScript = useCallback(
    (scriptName) =>
      new Promise((resolve, reject) => {
        const url = `${viewerScriptsBasePath}${scriptName}.js`;
        loadjs(url, {
          success: () => resolve(scriptName),
          error: () => {
            const error = new Error(`Failed to load viewer script ${url}`);
            console.warn('[Viewer] Failed to load viewer script', error);
            reject(error);
          }
        });
      }),
    [viewerScriptsBasePath]
  );

  const loadViewerEnhancements = useCallback(
    async (showData) => {
      try {
        const scripts = await fetchViewerScripts();
        // makeItSnow is gated by its own preference; viewerId (anonymous viewer
        // id + the privacy-notice pill) only loads for shows whose owner opted
        // into the analytics beta. Everything else loads for every show.
        const scriptsToLoad = _.filter(scripts, (script) => {
          if (script === 'makeItSnow') return !!showData?.preferences?.makeItSnow;
          if (script === 'viewerId') return !!showData?.preferences?.analyticsBetaOptIn;
          return true;
        });
        await Promise.all(
          _.map(scriptsToLoad, (script) =>
            loadViewerScript(script).catch((error) => {
              console.warn(`[Viewer] Giving up on viewer script ${script}`, error);
              return null;
            })
          )
        );
      } catch (error) {
        console.warn('[Viewer] Unable to load external viewer scripts', error);
        trackPosthogEvent('viewer_scripts_load_failed', { message: error?.message });
      }
    },
    [fetchViewerScripts, loadViewerScript]
  );

  const displayCurrentViewerMessages = (parsedViewerPage) => {
    _.map(viewerPageMessageElements, (message) => {
      parsedViewerPage = parsedViewerPage?.replace(message?.element, message?.current);
    });
    return parsedViewerPage;
  };

  const convertViewerPageToReact = useCallback(async () => {
    const isValidNode = () => true;

    let parsedViewerPage = activeViewerPage;

    let instructions = defaultProcessingInstructions(processNodeDefinitions);

    let formattedNowPlayingTimer = '0:00';
    if (show?.playingNow !== '') {
      const playingNowMinutes = Math.floor(nowPlayingTimer / 60);
      const playingNowSeconds = nowPlayingTimer - playingNowMinutes * 60;
      if (nowPlayingTimer) {
        formattedNowPlayingTimer = `${playingNowMinutes}:${playingNowSeconds}`;
        if (playingNowMinutes < 10) {
          formattedNowPlayingTimer = `0${playingNowMinutes}:${playingNowSeconds}`;
        }
        if (playingNowSeconds < 10) {
          formattedNowPlayingTimer = `${playingNowMinutes}:0${playingNowSeconds}`;
        }
      }
    }

    parsedViewerPage = parsedViewerPage?.replace(/{QUEUE_DEPTH}/g, show?.preferences?.jukeboxDepth);
    // PRD-019 — only GPS-gated shows can fail a location check, so only they get
    // a slot. Must happen before the parse below: the token has to be in the
    // string for the parser's instructions to find it.
    if (show?.preferences?.locationCheckMethod === LocationCheckMethod.GEO) {
      parsedViewerPage = injectRetryLocationToken(parsedViewerPage);
      parsedViewerPage = injectInlineRetryLocationToken(parsedViewerPage);
    }
    parsedViewerPage = displayCurrentViewerMessages(parsedViewerPage);

    const sequencesElement = [];
    const categoriesPlaced = [];
    let jukeboxRequestsElement = [];

    // PSA-v2 — operator-injected items (leaders, override PSAs, cadence
    // PSAs) are stripped by the viewer service in getShow before reaching
    // the client. show.requests therefore contains only what the viewer
    // should see and count. No client-side filter needed; just use the
    // array as-is for both the queue list iteration and the queueDepth
    // template variable below.

    let playingNow = <>{show?.playingNow}</>;
    let playingNext = <>{show?.playingNext}</>;

    // #73 — a sequence the viewer can't currently request/vote on (on the
    // hide-after-play cooldown, or at its #163 nightly play cap) is rendered
    // grayed-out and non-interactive instead of vanishing. Inline styling so it
    // holds regardless of the operator's page CSS; the server-side
    // SEQUENCE_UNAVAILABLE guard backs it up for clients that don't re-check.
    const nightlyPlayLimit = show?.preferences?.nightlyPlayLimit;
    // Nightly cap is per-song; skip it for group entries (which carry a
    // representative member's playsToday). Cooldown (visibilityCount) applies to
    // both — a group entry carries the group's own visibilityCount.
    //
    // The `!seq?.group` exemption mirrors the server: GraphQLMutationService's
    // checkIfSequenceUnavailable (the SEQUENCE_UNAVAILABLE guard) runs ONLY on
    // single-sequence requests/votes. The grouped branches of addSequenceToQueue
    // and voteForSequence never call it, so the server never rejects a grouped
    // request/vote on the nightly cap. Keeping the client exemption in sync means
    // we don't gray out something the server would actually accept.
    const isSequenceUnavailable = (seq) =>
      (seq?.visibilityCount ?? 0) > 0 ||
      (!seq?.group && nightlyPlayLimit > 0 && (seq?.playsToday ?? 0) >= nightlyPlayLimit);
    const unavailableStyle = { opacity: 0.4, pointerEvents: 'none' };
    const unavailableHint = (seq) => ((seq?.visibilityCount ?? 0) > 0 ? 'Available again soon' : 'Back next show');

    // Category sections render in the operator's dashboard order. The walk below
    // opens a section on first-encounter of a member, so reorder the sequences by
    // category rank up front; uncategorized songs lead, everything else keeps its
    // incoming (by-`order`) sequence order.
    const orderedSequences = orderSequencesByCategory(show?.sequences, show?.categories);

    _.map(orderedSequences, (sequence) => {
      if (sequence.visible) {
        let sequenceImageElement = sequenceImage(sequence);
        if (show?.preferences?.viewerControlMode === ViewerControlMode.VOTING) {
          let sequenceVotes = 0;
          _.forEach(show?.votes, (vote) => {
            // Skip system-injected priority votes (PSA/leader/override, votes >= 2000).
            // They aren't viewer votes and would otherwise show a bogus tally
            // (e.g. an operator-overridden song reading "2000 votes").
            if (vote?.systemInjected || (vote?.votes || 0) >= 2000) {
              return;
            }
            if (vote?.sequence?.name === sequence?.name || vote?.sequenceGroup?.name === sequence?.group) {
              sequenceVotes = vote?.votes;
            }
          });
          if (sequenceVotes !== -1) {
            if (sequence.category == null || sequence.category === '') {
              const votingListClassname = `cell-vote-playlist cell-vote-playlist-${sequence.index}`;
              const votingListArtistClassname = `cell-vote-playlist-artist cell-vote-playlist-artist-${sequence.index}`;

              if (show?.playingNowSequence != null) {
                const playingNowSequence = show?.playingNowSequence;
                playingNow = (
                  <>
                    {sequenceImage(playingNowSequence)}
                    {playingNowSequence?.displayName}
                    <div className={votingListArtistClassname}>{playingNowSequence?.artist}</div>
                  </>
                );
              }

              if (show?.playingNextSequence != null) {
                const playingNextSequence = show?.playingNextSequence;
                playingNext = (
                  <>
                    {sequenceImage(playingNextSequence)}
                    {playingNextSequence?.displayName}
                    <div className={votingListArtistClassname}>{playingNextSequence?.artist}</div>
                  </>
                );
              }

              sequencesElement.push(
                <>
                  <div
                    className={votingListClassname}
                    style={isSequenceUnavailable(sequence) ? unavailableStyle : undefined}
                    title={isSequenceUnavailable(sequence) ? unavailableHint(sequence) : undefined}
                    onClick={(e) =>
                      show?.preferences?.viewerPageViewOnly || isSequenceUnavailable(sequence) ? _.noop() : voteForSequence(e)
                    }
                    data-key={sequence.name}
                    data-key-2={sequence.displayName}
                  >
                    {sequenceImageElement}
                    {sequence.displayName}
                    <div data-key={sequence.name} data-key-2={sequence.displayName} className={votingListArtistClassname}>
                      {sequence.artist}
                    </div>
                  </div>
                  <div className="cell-vote">{sequenceVotes}</div>
                </>
              );
            } else if (!_.includes(categoriesPlaced, sequence.category)) {
              categoriesPlaced.push(sequence.category);
              const categorizedSequencesArray = [];
              const categorizedSequencesToIterate = _.cloneDeep(show?.sequences);
              _.map(categorizedSequencesToIterate, (categorizedSequence) => {
                let categorizedSequenceVotes = 0;
                _.forEach(show?.votes, (vote) => {
                  if (vote?.sequence?.name === categorizedSequence?.name) {
                    categorizedSequenceVotes = vote?.votes;
                  }
                });
                // const categorizedSequenceVotes = _.find(show?.votes, (vote) => vote?.sequence?.name === categorizedSequence?.name);
                if (categorizedSequence.visible) {
                  if (categorizedSequence.category === sequence.category) {
                    sequenceImageElement = sequenceImage(categorizedSequence);
                    const categorizedVotingListClassname = `cell-vote-playlist cell-vote-playlist-${sequence.index}`;
                    const categorizedVotingListArtistClassname = `cell-vote-playlist-artist cell-vote-playlist-artist-${sequence.index}`;
                    // Keep each card glued to its own vote count. Both live in the
                    // flex-wrap .category-section, so without this wrapper the browser
                    // greedy-packs them as independent items and the variable-width
                    // category label shifts every badge from the right of its card to
                    // the left (or vice versa) depending on the label's length.
                    // align-items:flex-end (not center) so the short vote badge's
                    // bottom border lines up with the taller card's bottom-border
                    // divider — otherwise the two underlines stagger at different
                    // heights per row in templates that border-bottom both elements.
                    const theElement = (
                      <div className="cell-vote-row" style={{ display: 'flex', width: '100%', alignItems: 'flex-end' }}>
                        <div
                          className={categorizedVotingListClassname}
                          style={isSequenceUnavailable(categorizedSequence) ? unavailableStyle : undefined}
                          title={isSequenceUnavailable(categorizedSequence) ? unavailableHint(categorizedSequence) : undefined}
                          onClick={(e) =>
                            show?.preferences?.viewerPageViewOnly || isSequenceUnavailable(categorizedSequence)
                              ? _.noop()
                              : voteForSequence(e)
                          }
                          data-key={categorizedSequence.name}
                        >
                          {sequenceImageElement}
                          {categorizedSequence.displayName}
                          <div data-key={categorizedSequence.name} className={categorizedVotingListArtistClassname}>
                            {categorizedSequence.artist}
                          </div>
                        </div>
                        <div className="cell-vote">{categorizedSequenceVotes}</div>
                      </div>
                    );
                    categorizedSequencesArray.push(theElement);
                  }
                }
              });

              sequencesElement.push(
                <>
                  <div className="category-section" style={{ width: '100%', display: 'flex', flexWrap: 'wrap' }}>
                    <div className="category-label" style={{ flexBasis: '100%' }}>
                      {sequence.category}
                    </div>
                    {categorizedSequencesArray}
                  </div>
                </>
              );
            }
          }
        } else if (show?.preferences?.viewerControlMode === ViewerControlMode.JUKEBOX) {
          const jukeboxListClassname = `jukebox-list jukebox-list-${sequence.index}`;
          const jukeboxListArtistClassname = `jukebox-list-artist jukebox-list-artist-${sequence.index}`;

          if (show?.playingNowSequence != null) {
            const playingNowSequence = show?.playingNowSequence;
            playingNow = (
              <>
                {sequenceImage(playingNowSequence)}
                {playingNowSequence?.displayName}
                <div className={jukeboxListArtistClassname}>{playingNowSequence?.artist}</div>
              </>
            );
          }

          if (show?.playingNextSequence != null) {
            const playingNextSequence = show?.playingNextSequence;
            playingNext = (
              <>
                {sequenceImage(playingNextSequence)}
                {playingNextSequence?.displayName}
                <div className={jukeboxListArtistClassname}>{playingNextSequence?.artist}</div>
              </>
            );
          }

          if (sequence.category == null || sequence.category === '') {
            sequencesElement.push(
              <>
                <div
                  className={jukeboxListClassname}
                  style={isSequenceUnavailable(sequence) ? unavailableStyle : undefined}
                  title={isSequenceUnavailable(sequence) ? unavailableHint(sequence) : undefined}
                  onClick={(e) =>
                    show?.preferences?.viewerPageViewOnly || isSequenceUnavailable(sequence) ? _.noop() : addSequenceToQueue(e)
                  }
                  data-key={sequence.name}
                  data-key-2={sequence.displayName}
                >
                  {sequenceImageElement}
                  {sequence.displayName}
                  <div data-key={sequence.name} data-key-2={sequence.displayName} className={jukeboxListArtistClassname}>
                    {sequence.artist}
                  </div>
                </div>
              </>
            );
          } else if (!_.includes(categoriesPlaced, sequence.category)) {
            categoriesPlaced.push(sequence.category);
            const categorizedSequencesArray = [];
            const categorizedSequencesToIterate = _.cloneDeep(show?.sequences);
            _.map(categorizedSequencesToIterate, (categorizedSequence) => {
              if (categorizedSequence.visible) {
                if (categorizedSequence.category === sequence.category) {
                  sequenceImageElement = sequenceImage(categorizedSequence);
                  const categorizedJukeboxListClassname = `jukebox-list jukebox-list-${categorizedSequence.index}`;
                  const categorizedJukeboxListArtistClassname = `jukebox-list-artist jukebox-list-artist-${categorizedSequence.index}`;
                  const theElement = (
                    <>
                      <div
                        className={categorizedJukeboxListClassname}
                        style={isSequenceUnavailable(categorizedSequence) ? unavailableStyle : undefined}
                        title={isSequenceUnavailable(categorizedSequence) ? unavailableHint(categorizedSequence) : undefined}
                        onClick={(e) =>
                          show?.preferences?.viewerPageViewOnly || isSequenceUnavailable(categorizedSequence)
                            ? _.noop()
                            : addSequenceToQueue(e)
                        }
                        data-key={categorizedSequence.name}
                      >
                        {sequenceImageElement}
                        {categorizedSequence.displayName}
                        <div data-key={categorizedSequence.name} className={categorizedJukeboxListArtistClassname}>
                          {categorizedSequence.artist}
                        </div>
                      </div>
                    </>
                  );
                  categorizedSequencesArray.push(theElement);
                }
              }
            });

            sequencesElement.push(
              <>
                <div className="category-section ">
                  <div className="category-label">{sequence.category}</div>
                  {categorizedSequencesArray}
                </div>
              </>
            );
          }

          jukeboxRequestsElement = [];
          // show.requests is already filtered server-side to only the items
          // the viewer should see (no leaders, no operator PSAs).
          let updatedRequests = _.orderBy(show?.requests || [], ['position'], ['asc']);
          _.map(updatedRequests, (request, index) => {
            // Don't add Playing Now or Next Playing to list
            if (index !== 0) {
              jukeboxRequestsElement.push(
                <>
                  <div className="jukebox-queue">
                    {sequenceImage(request?.sequence)}
                    {request?.sequence?.displayName}
                    <div className={jukeboxListArtistClassname}>{request?.sequence.artist}</div>
                  </div>
                </>
              );
            }
          });
        }
      }
    });

    const locationCodeElement = (
      <>
        <TextField type="number" name="locationCode" onChange={(e) => setEnteredLocationCode(e?.target?.value)} />
      </>
    );

    // #162 — fill the {VOTES_REMAINING} slot only in voting mode with a cap set
    // and a known count; the helper renders empty for the other branches.
    const dailyVoteLimit = show?.preferences?.dailyVoteLimit ?? 0;
    const votesRemainingElement =
      show?.preferences?.viewerControlMode === ViewerControlMode.VOTING && dailyVoteLimit > 0 && votesRemaining != null ? (
        <>
          {votesRemaining} of {dailyVoteLimit} votes left this show
        </>
      ) : (
        <></>
      );

    // PRD-019 — only GPS-gated shows can produce a permission failure, so the
    // control is inert everywhere else. `LocationRecoveryControl` decides on its
    // own whether to render anything for the current permission state; passing
    // it here does not mean it appears.
    const retryLocationElement =
      show?.preferences?.locationCheckMethod === LocationCheckMethod.GEO ? (
        <LocationRecoveryControl permission={locationPermission} onRetry={retryViewerLocation} onPosition={acceptElementPosition} />
      ) : (
        <></>
      );

    // Secondary surface, inside the operator's invalidLocation message. Hidden
    // by that block's own display:none until a rejection shows it.
    const retryLocationInlineElement =
      show?.preferences?.locationCheckMethod === LocationCheckMethod.GEO ? (
        <LocationRecoveryControl
          variant="inline"
          permission={locationPermission}
          onRetry={retryViewerLocation}
          onPosition={acceptElementPosition}
        />
      ) : (
        <></>
      );

    instructions = processingInstructions(
      processNodeDefinitions,
      show?.preferences?.viewerControlEnabled,
      show?.preferences?.viewerControlMode,
      show?.preferences?.locationCheckMethod,
      sequencesElement,
      jukeboxRequestsElement,
      playingNow,
      playingNext,
      // Already filtered server-side to viewer-visible requests only.
      show?.requests?.length,
      locationCodeElement,
      formattedNowPlayingTimer,
      votesRemainingElement,
      retryLocationElement,
      retryLocationInlineElement
    );

    const reactHtml = htmlToReactParser.parseWithInstructions(parsedViewerPage, isValidNode, instructions);
    setRemoteViewerReactPage(reactHtml);
  }, [
    activeViewerPage,
    addSequenceToQueue,
    show?.requests,
    show?.playingNext,
    show?.playingNow,
    show?.preferences?.locationCheckMethod,
    show?.preferences?.jukeboxDepth,
    show?.preferences?.makeItSnow,
    show?.preferences?.viewerControlEnabled,
    show?.preferences?.viewerControlMode,
    show?.preferences?.dailyVoteLimit,
    show?.requests?.length,
    show?.sequences,
    show?.categories,
    voteForSequence,
    nowPlayingTimer,
    votesRemaining,
    // Completed to satisfy exhaustive-deps. These were always read here but never
    // declared; the unconditional 500ms reparse hid it. Now that the reparse is
    // gated on this callback's identity, an undeclared dep is a stale render, so
    // the list has to be honest.
    show?.votes,
    show?.playingNowSequence,
    show?.playingNextSequence,
    show?.preferences?.nightlyPlayLimit,
    show?.preferences?.viewerPageViewOnly,
    locationPermission,
    retryViewerLocation,
    acceptElementPosition
  ]);

  const getActiveViewerPage = useCallback(() => {
    getActiveViewerPageQuery({
      context: {
        headers: {
          Route: 'Viewer'
        }
      },
      variables: {
        showSubdomain: getSubdomain()
      },
      fetchPolicy: 'network-only',
      onCompleted: (data) => {
        setActiveViewerPage(data?.getActiveViewerPage);
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    });
  }, [dispatch, getActiveViewerPageQuery]);

  const orderSequencesForVoting = useCallback((showData) => {
    let updatedSequences = [];
    _.forEach(showData?.sequences, (sequence) => {
      const sequenceVotes = _.find(
        showData?.votes,
        (vote) => vote?.sequence?.name === sequence?.name || vote?.sequenceGroup?.name === sequence?.name
      );
      updatedSequences.push({
        ...sequence,
        votes: sequenceVotes?.votes || 0,
        lastVoteTime: sequenceVotes?.lastVoteTime
      });
    });
    updatedSequences = _.orderBy(updatedSequences, ['votes', 'lastVoteTime'], ['desc', 'asc']);
    showData.sequences = updatedSequences;
  }, []);

  const getShowForInit = useCallback(() => {
    getShowQuery({
      context: {
        headers: {
          Route: 'Viewer'
        }
      },
      variables: {
        showSubdomain: getSubdomain()
      },
      onCompleted: async (data) => {
        const showData = { ...data?.getShow };

        const subdomain = getSubdomain();

        if (showData?.preferences?.selfHostedRedirectUrl) {
          const referrer = document.referrer;
          if (!_.includes(blockRedirectReferrers, referrer)) {
            window.location.href = showData?.preferences?.selfHostedRedirectUrl;
            return; // Exit early since we're redirecting
          }
        }

        if (subdomain === showData?.showSubdomain) {
          if (showData?.playingNext === '') {
            showData.playingNext = showData?.playingNextFromSchedule;
          }
          setNowPlaying(showData?.playingNow);
          if (showData?.preferences?.viewerControlMode === ViewerControlMode.VOTING) {
            orderSequencesForVoting(showData);
          }
          setShow(showData);
          // #162 — seed the votes-left count on load so the {VOTES_REMAINING}
          // slot is correct before the first vote.
          refreshVotesRemaining(showData?.preferences?.analyticsBetaOptIn);
          getActiveViewerPage();
          if (showData?.preferences?.locationCheckMethod === LocationCheckMethod.GEO) {
            setViewerLocation();
          }
          trackPosthogEvent('viewer_page_view', { show_name: showData?.showName });

          // Page-view ping. Attach the anonymous viewerId only when the show
          // owner opted into the analytics beta — otherwise we neither create
          // nor send an id (and the privacy pill / viewerId.js stays unloaded).
          // Fired here (not on mount) because the opt-in flag isn't known until
          // getShow resolves.
          insertViewerPageStatsMutation({
            context: {
              headers: {
                Route: 'Viewer'
              }
            },
            variables: {
              showSubdomain: getSubdomain(),
              date: moment().format('YYYY-MM-DDTHH:mm:ss'),
              viewerId: showData?.preferences?.analyticsBetaOptIn ? getViewerId() : null
            }
          }).then();

          setTimeout(() => {
            loadViewerEnhancements(showData);
          }, 500);

          setLoading(false);
        }
      },
      onError: () => {
        showAlert(dispatch, { alert: 'error' });
      }
    }).then();
  }, [dispatch, getShowQuery, getActiveViewerPage, orderSequencesForVoting, setViewerLocation, insertViewerPageStatsMutation, refreshVotesRemaining]);

  useEffect(() => {
    setLoading(true);
    getShowForInit();
  }, [getShowForInit]);

  // Update favicon to the show's custom icon (or fall back to the default brand icon).
  // We imperatively update the existing `#rf-favicon` <link> tag rather than letting
  // react-helmet append a second one, because browsers don't reliably honor the later
  // tag when multiple <link rel="icon"> elements are present (issue #98).
  useEffect(() => {
    const defaultIconHref = '/rf-favicon.png';
    const iconLink = document.getElementById('rf-favicon');
    if (!iconLink) return undefined;
    const desiredHref = show?.preferences?.pageIconUrl?.trim() || defaultIconHref;
    if (iconLink.getAttribute('href') !== desiredHref) {
      iconLink.setAttribute('href', desiredHref);
    }
    // On unmount (or when the show changes), restore the default brand icon so other
    // routes (control panel, login, etc.) don't keep showing the previous custom icon.
    return () => {
      const link = document.getElementById('rf-favicon');
      if (link && link.getAttribute('href') !== defaultIconHref) {
        link.setAttribute('href', defaultIconHref);
      }
    };
  }, [show?.preferences?.pageIconUrl]);

  // Process polling data updates
  useEffect(() => {
    if (pollingData?.getShow) {
      const showData = { ...pollingData.getShow };
      const subdomain = getSubdomain();
      if (subdomain === showData?.showSubdomain) {
        if (showData?.playingNext === '') {
          showData.playingNext = showData?.playingNextFromSchedule;
        }
        if (showData?.preferences?.viewerControlMode === ViewerControlMode.VOTING) {
          orderSequencesForVoting(showData);
        }
        setShow(showData);
        // Note: We don't fetch the active viewer page HTML during polling
        // It's only fetched on initial load and doesn't change during a viewer session
      }
    }
  }, [pollingData, orderSequencesForVoting]);

  // Re-parse the operator's page only when something it renders from actually
  // changed. This tick used to reparse the whole HTML document and rebuild the
  // entire React tree twice a second unconditionally, which on a traced
  // production page re-fetched the same webfont four times and the same artwork
  // repeatedly, and burned the main thread through the whole load.
  //
  // The change signal is `convertViewerPageToReact`'s own identity: it's a
  // useCallback, so React already recomputes it exactly when one of its declared
  // deps changes. Anything missing from that dep array was already missing
  // before this gate — the one genuine exception is `viewerPageMessageElements`,
  // a module-level object that showViewerMessage mutates imperatively, so it
  // never trips the identity and has to be folded in by hand.
  const lastConvertRef = useRef(null);
  const lastMessageStateRef = useRef(null);

  useInterval(async () => {
    const messageState = _.map(viewerPageMessageElements, (message) => message?.current).join('|');
    if (lastConvertRef.current === convertViewerPageToReact && lastMessageStateRef.current === messageState) {
      return;
    }
    lastConvertRef.current = convertViewerPageToReact;
    lastMessageStateRef.current = messageState;
    await convertViewerPageToReact();
  }, 500);

  useInterval(() => {
    const next = nextNowPlayingState({ nowPlaying, nowPlayingTimer }, show);
    if (next.nowPlaying !== nowPlaying) {
      setNowPlaying(next.nowPlaying);
    }
    if (next.nowPlayingTimer !== nowPlayingTimer) {
      setNowPlayingTimer(next.nowPlayingTimer);
    }
  }, 1000);

  return (
    <>
      {show && (
        <Helmet>
          <style type="text/css">
            {`
              #embedim--snow {
                text-align: inherit;
              }
            `}
          </style>
          <title>{show?.preferences?.pageTitle}</title>
        </Helmet>
      )}
      <Loading loading={loading} background="black" loaderColor="white" />
      {remoteViewerReactPage}
    </>
  );
};

export default ExternalViewerPage;
