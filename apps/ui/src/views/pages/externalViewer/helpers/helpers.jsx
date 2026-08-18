// eslint-disable-next-line import/prefer-default-export
import React from 'react';

import { LocationCheckMethod, ViewerControlMode } from '../../../../utils/enum';

/**
 * Artwork for one sequence, or `null` when the operator hasn't set an image.
 *
 * Every sequence card, playing-now/next slot and jukebox queue row goes through
 * here so the loading attributes stay in one place. A busy show renders 80+ of
 * these; a traced production page pulled 5.3 MB of artwork eagerly, nearly all
 * of it far below the fold, which pushed LCP out and shifted layout as each
 * image landed.
 *
 * - `loading="lazy"` defers off-screen artwork. In-viewport images still load
 *   immediately, so the playing-now slot is unaffected.
 * - `decoding="async"` keeps decode off the main thread — it competes with the
 *   viewer-page parse otherwise.
 *
 * Intrinsic width/height are deliberately NOT set: the URLs are operator-supplied
 * and we don't know their real dimensions, and guessing would fight the
 * operator's own `.sequence-image` CSS. Reserving space needs a real size
 * (stored at upload time), which is a separate change.
 *
 * `className` keeps the `sequence-image sequence-image-<index>` contract that
 * operator templates style against — don't change the shape without a migration.
 */
export const sequenceImage = (sequence) => {
  const imageUrl = sequence?.imageUrl;
  if (!imageUrl || !imageUrl.replace(/\s/g, '').length) {
    return null;
  }
  return (
    // ORDER MATTERS: `loading` and `decoding` MUST precede `src`. React applies
    // props in declaration order, and Chrome commits to eager-or-lazy at the
    // moment `src` is assigned — set it first and the fetch is already in flight
    // before `loading="lazy"` lands, so every image loads eagerly and the
    // attribute is decorative. Measured: 80/80 fetched with src first, 29/80
    // with loading first.
    <img
      loading="lazy"
      decoding="async"
      alt={sequence?.name}
      className={`sequence-image sequence-image-${sequence?.index}`}
      src={imageUrl}
      data-key={sequence?.name}
    />
  );
};

const locationCodeNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{LOCATION_CODE}';
  },
  processNode() {
    return value;
  }
});

const sequencesNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{PLAYLISTS}';
  },
  processNode() {
    return value;
  }
});

const votesNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{VOTES}';
  },
  processNode() {
    return value;
  }
});

const nowPlayingNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{NOW_PLAYING}';
  },
  processNode() {
    return value;
  }
});

const nowPlayingTimerNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{NOW_PLAYING_TIMER}';
  },
  processNode() {
    return value;
  }
});

const nextSequenceNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{NEXT_PLAYLIST}';
  },
  processNode() {
    return value;
  }
});

const queueSizeNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{QUEUE_SIZE}';
  },
  processNode() {
    return value;
  }
});

const jukeboxQueueNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{JUKEBOX_QUEUE}';
  },
  processNode() {
    return value;
  }
});

// #162 — operator-placed {VOTES_REMAINING} variable. Filled with "X of N votes
// left this show" in voting mode when a daily cap is set; empty otherwise (no
// cap, jukebox mode, or a voting-exempt IP) so the slot collapses.
const votesRemainingNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{VOTES_REMAINING}';
  },
  processNode() {
    return value;
  }
});

// PRD-019 — {RETRY_LOCATION} slot for the location-recovery control. Auto-
// injected into the page string when the operator hasn't placed it themselves,
// so all ~2600 existing shows get it without touching their page. Empty unless
// the viewer genuinely cannot request (see LocationRecoveryControl).
const retryLocationNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node && node.children && node.children[0] && node.children[0].data && node.children[0].data.trim() === '{RETRY_LOCATION}';
  },
  processNode() {
    return value;
  }
});

const afterHoursNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node.attribs && node.attribs['{after-hours-message}'] === '';
  },
  processNode() {
    return value;
  }
});

const votingDynamicContainerNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node.attribs && node.attribs['{on-demand-and-voting-dynamic-container}'] === '';
  },
  processNode() {
    return value;
  }
});

const jukeboxDynamicContainerNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node.attribs && node.attribs['{jukebox-dynamic-container}'] === '';
  },
  processNode() {
    return value;
  }
});

const votingPlaylistsDynamicContainerNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node.attribs && node.attribs['{playlist-voting-dynamic-container}'] === '';
  },
  processNode() {
    return value;
  }
});

const jukeboxPlaylistsDynamicContainerNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node.attribs && node.attribs['{playlist-standard-dynamic-container}'] === '';
  },
  processNode() {
    return value;
  }
});

const locationCodeDynamicContainerNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node.attribs && node.attribs['{location-code-dynamic-container}'] === '';
  },
  processNode() {
    return value;
  }
});

// PRD-019 — operator-placeable wrapper, blanked wholesale when the show isn't
// GPS-gated. Same mechanism as {location-code-dynamic-container}: it lets an
// operator wrap the control in their own layout without that layout surviving
// on a show where the control can never appear.
const locationPermissionDynamicContainerNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode(node) {
    return node.attribs && node.attribs['{location-permission-dynamic-container}'] === '';
  },
  processNode() {
    return value;
  }
});

const allNodes = (processNodeDefinitions) => ({
  shouldProcessNode() {
    return true;
  },
  processNode: processNodeDefinitions.processDefaultNode
});

const blankNode = (value) => ({
  replaceChildren: true,
  shouldProcessNode() {
    return '';
  },
  processNode() {
    return value;
  }
});

export const defaultProcessingInstructions = (processNodeDefinitions) => [allNodes(processNodeDefinitions)];

export const processingInstructions = (
  processNodeDefinitions,
  viewerControlEnabled,
  viewerControlMode,
  locationCheckMethod,
  sequences,
  jukeboxRequests,
  nowPlaying,
  nextSequence,
  queueDepth,
  locationCode,
  nowPlayingTimer,
  votesRemaining,
  retryLocation
) => {
  let processedNodes = [];
  if (!viewerControlEnabled) {
    processedNodes = [
      locationCodeNode(<></>),
      sequencesNode(<></>),
      votesNode(<></>),
      votesRemainingNode(<></>),
      nowPlayingNode(<></>),
      nowPlayingTimerNode(<></>),
      nextSequenceNode(<></>),
      queueSizeNode(<></>),
      jukeboxQueueNode(<></>),
      votingDynamicContainerNode(<></>),
      jukeboxDynamicContainerNode(<></>),
      votingPlaylistsDynamicContainerNode(<></>),
      jukeboxPlaylistsDynamicContainerNode(<></>),
      locationCodeDynamicContainerNode(<></>),
      retryLocationNode(<></>),
      locationPermissionDynamicContainerNode(<></>),
      allNodes(processNodeDefinitions)
    ];
  } else if (viewerControlMode === ViewerControlMode.JUKEBOX) {
    processedNodes = [
      locationCodeNode(<>{locationCode}</>),
      sequencesNode(<>{sequences}</>),
      votesRemainingNode(<></>),
      nowPlayingNode(<>{nowPlaying}</>),
      nowPlayingTimerNode(<>{nowPlayingTimer}</>),
      nextSequenceNode(<>{nextSequence}</>),
      queueSizeNode(<>{queueDepth}</>),
      jukeboxQueueNode(<>{jukeboxRequests}</>),
      votingDynamicContainerNode(<></>),
      votingPlaylistsDynamicContainerNode(<></>),
      locationCheckMethod === LocationCheckMethod.CODE ? blankNode(null) : locationCodeDynamicContainerNode(<></>),
      retryLocationNode(<>{retryLocation}</>),
      // Inverse of the location-code container above: that one survives only on
      // CODE shows, this one only on GEO shows. `blankNode` matches nothing, so
      // it is how a branch says "leave this container alone".
      locationCheckMethod === LocationCheckMethod.GEO ? blankNode(null) : locationPermissionDynamicContainerNode(<></>),
      afterHoursNode(<></>),
      allNodes(processNodeDefinitions)
    ];
  } else {
    processedNodes = [
      locationCodeNode(<>{locationCode}</>),
      sequencesNode(<>{sequences}</>),
      votesNode(<></>),
      votesRemainingNode(<>{votesRemaining}</>),
      nowPlayingNode(<>{nowPlaying}</>),
      nowPlayingTimerNode(<>{nowPlayingTimer}</>),
      nextSequenceNode(<>{nextSequence}</>),
      queueSizeNode(<></>),
      jukeboxQueueNode(<></>),
      jukeboxDynamicContainerNode(<></>),
      jukeboxPlaylistsDynamicContainerNode(<></>),
      locationCheckMethod === LocationCheckMethod.CODE ? blankNode(null) : locationCodeDynamicContainerNode(<></>),
      retryLocationNode(<>{retryLocation}</>),
      // Inverse of the location-code container above: that one survives only on
      // CODE shows, this one only on GEO shows. `blankNode` matches nothing, so
      // it is how a branch says "leave this container alone".
      locationCheckMethod === LocationCheckMethod.GEO ? blankNode(null) : locationPermissionDynamicContainerNode(<></>),
      afterHoursNode(<></>),
      allNodes(processNodeDefinitions)
    ];
  }
  return processedNodes;
};

/**
 * Where to hang the slot, most-preferred first.
 *
 * The mode containers come FIRST and that ordering is load-bearing. The obvious
 * anchor is the song list itself, but {PLAYLISTS} and {VOTES} appear once per
 * control mode inside containers that get blanked for the mode the show is NOT
 * in — on a stock jukebox template the earliest live {PLAYLISTS} sits inside
 * {playlist-voting-dynamic-container}, so a slot anchored there is silently
 * erased and the control never renders at all.
 *
 * Anchoring above the containers puts the slot ahead of the whole request
 * section regardless of mode, which is also where it belongs: the viewer has to
 * see it BEFORE tapping a song, not beside one list of them.
 *
 * The song-list tokens stay as a fallback for custom pages built without the
 * container attributes.
 */
const ANCHOR_TOKENS = [
  '{on-demand-and-voting-dynamic-container}',
  '{jukebox-dynamic-container}',
  '{playlist-voting-dynamic-container}',
  '{playlist-standard-dynamic-container}',
  '{PLAYLISTS}',
  '{VOTES}'
];

/**
 * Regions of the page where a token is discussed rather than used.
 *
 * Every stock template ships a documentation comment listing the placeholders
 * ("The following are the variables used to populate your lists so DON'T MODIFY
 * THESE!!: {PLAYLISTS} - Displays the list of your sequences..."), and on the
 * real templates that comment is the FIRST occurrence of {PLAYLISTS} by ~17KB.
 * A naive indexOf anchors on the prose and drops the control at the very top of
 * the page instead of above the song list. Style and script bodies are excluded
 * for the same reason.
 */
const INERT_REGIONS = [
  ['<!--', '-->'],
  ['<style', '</style>'],
  ['<script', '</script>']
];

const inertRanges = (html) => {
  const ranges = [];
  INERT_REGIONS.forEach(([open, close]) => {
    let from = 0;
    for (;;) {
      const start = html.indexOf(open, from);
      if (start < 0) {
        break;
      }
      const end = html.indexOf(close, start + open.length);
      // An unterminated comment or block swallows the rest of the page, which
      // is exactly how a browser would treat it too.
      ranges.push([start, end < 0 ? html.length : end + close.length]);
      from = end < 0 ? html.length : end + close.length;
    }
  });
  return ranges;
};

/** First index of `token` that is actual markup, not prose in a comment. */
const firstLiveIndex = (html, token) => {
  const ranges = inertRanges(html);
  let from = 0;
  for (;;) {
    const at = html.indexOf(token, from);
    if (at < 0) {
      return -1;
    }
    if (!ranges.some(([start, end]) => at >= start && at < end)) {
      return at;
    }
    from = at + token.length;
  }
};

/**
 * PRD-019 — put a {RETRY_LOCATION} slot on pages that don't have one.
 *
 * This runs on the RAW PAGE STRING, before `parseWithInstructions` turns it
 * into React. That ordering is the whole trick: the token we splice in here is
 * indistinguishable from one the operator typed, so the existing parser renders
 * it as a live element and every GPS-gated show gets the control on deploy with
 * no operator action. "Whatever ships must work on a template nobody has
 * touched since 2022" is a hard requirement of this feature.
 *
 * An operator who has placed the token themselves gets left alone entirely —
 * that is how they control position, and (via a display:none wrapper) how they
 * opt out.
 *
 * Anchored immediately before the request section (see ANCHOR_TOKENS), because
 * the control has to be seen BEFORE a song is tapped. A viewer who only finds
 * out after tapping has already spent the interaction this exists to save.
 *
 * @param {string} viewerPage  raw operator page HTML
 * @returns {string} the page, with a slot added if one was needed and placeable
 */
export const injectRetryLocationToken = (viewerPage) => {
  if (!viewerPage || firstLiveIndex(viewerPage, '{RETRY_LOCATION}') >= 0) {
    return viewerPage;
  }

  const anchors = ANCHOR_TOKENS.map((token) => firstLiveIndex(viewerPage, token)).filter((index) => index >= 0);
  if (!anchors.length) {
    // No request UI on the page at all. We have no idea where the viewer picks
    // a song, and guessing would drop the control somewhere arbitrary — better
    // to leave the page untouched than to deface it.
    return viewerPage;
  }

  // Back up to the opening tag of the element that CARRIES the anchor. For a
  // container attribute that is its own tag; for a song-list token it is the
  // element wrapping it. Either way the slot must be a SIBLING — the token-node
  // matcher requires {RETRY_LOCATION} to be its element's only content, and a
  // slot placed inside a mode container would be blanked with it.
  const tokenAt = Math.min(...anchors);
  const containerAt = viewerPage.lastIndexOf('<', tokenAt);
  const insertAt = containerAt >= 0 ? containerAt : tokenAt;

  return `${viewerPage.slice(0, insertAt)}<div>{RETRY_LOCATION}</div>${viewerPage.slice(insertAt)}`;
};

export const viewerPageMessageElements = {
  requestSuccessful: {
    element: /id="requestSuccessful"/g,
    current: 'id="requestSuccessful" style="display: none"',
    block: 'id="requestSuccessful" style="display: block"',
    none: 'id="requestSuccessful" style="display: none"'
  },
  requestPlaying: {
    element: /id="requestPlaying"/g,
    current: 'id="requestPlaying" style="display: none"',
    block: 'id="requestPlaying" style="display: block"',
    none: 'id="requestPlaying" style="display: none"'
  },
  queueFull: {
    element: /id="queueFull"/g,
    current: 'id="queueFull" style="display: none"',
    block: 'id="queueFull" style="display: block"',
    none: 'id="queueFull" style="display: none"'
  },
  invalidLocation: {
    element: /id="invalidLocation"/g,
    current: 'id="invalidLocation" style="display: none"',
    block: 'id="invalidLocation" style="display: block"',
    none: 'id="invalidLocation" style="display: none"'
  },
  alreadyVoted: {
    element: /id="alreadyVoted"/g,
    current: 'id="alreadyVoted" style="display: none"',
    block: 'id="alreadyVoted" style="display: block"',
    none: 'id="alreadyVoted" style="display: none"'
  },
  alreadyRequested: {
    element: /id="alreadyRequested"/g,
    current: 'id="alreadyRequested" style="display: none"',
    block: 'id="alreadyRequested" style="display: block"',
    none: 'id="alreadyRequested" style="display: none"'
  },
  requestFailed: {
    element: /id="requestFailed"/g,
    current: 'id="requestFailed" style="display: none"',
    block: 'id="requestFailed" style="display: block"',
    none: 'id="requestFailed" style="display: none"'
  },
  invalidLocationCode: {
    element: /id="invalidLocationCode"/g,
    current: 'id="invalidLocationCode" style="display: none"',
    block: 'id="invalidLocationCode" style="display: block"',
    none: 'id="invalidLocationCode" style="display: none"'
  },
  // #162 — shown when the viewer has used up their daily vote allotment
  // (server DAILY_VOTE_LIMIT_REACHED). Operator templates must add an
  // id="dailyVoteLimitReached" element for this to render.
  dailyVoteLimitReached: {
    element: /id="dailyVoteLimitReached"/g,
    current: 'id="dailyVoteLimitReached" style="display: none"',
    block: 'id="dailyVoteLimitReached" style="display: block"',
    none: 'id="dailyVoteLimitReached" style="display: none"'
  },
  // #73/#163 — shown when the viewer requests/votes a sequence that is on its
  // hide-after-play cooldown or at its nightly play cap (server
  // SEQUENCE_UNAVAILABLE). Operator templates must add an
  // id="sequenceUnavailable" element for this to render.
  sequenceUnavailable: {
    element: /id="sequenceUnavailable"/g,
    current: 'id="sequenceUnavailable" style="display: none"',
    block: 'id="sequenceUnavailable" style="display: block"',
    none: 'id="sequenceUnavailable" style="display: none"'
  }
};

// Number of seconds we trim off the reported duration when (re)seeding the
// {NOW_PLAYING_TIMER}. Roughly accounts for plugin->API->poll latency so the
// viewer's countdown doesn't lag the show's actual audio.
const NOW_PLAYING_TIMER_LEAD_SECONDS = 2;

/**
 * Pure reducer for the viewer's {NOW_PLAYING_TIMER} countdown, evaluated once
 * per 1Hz tick. Given the previous {nowPlaying, nowPlayingTimer} and the latest
 * `show` snapshot, it returns the next pair.
 *
 * The branches are MUTUALLY EXCLUSIVE — a tick either clears, reseeds, or
 * decrements, never both. The previous interval body ran the reseed and the
 * decrement as two independent `if` blocks, so a song-change tick fired both
 * and React's last-write-wins dropped the reseed whenever the prior timer was
 * still > 0. That stranded the countdown on the previous song after an early
 * interruption (issue #155): fine on normal playback (songs end near 0), broken
 * on interrupt (timer still counting). Keeping this exclusive is the fix.
 */
export const nextNowPlayingState = (prev, show) => {
  const playingNow = show?.playingNow;

  // Nothing playing -> clear.
  if (!playingNow || playingNow === ' ') {
    return { nowPlaying: '', nowPlayingTimer: 0 };
  }

  // Song changed -> reseed from the now-playing sequence's duration (once).
  // Prefer the backend-resolved playingNowSequence; fall back to matching the
  // sequences list by displayName (playingNow is the displayName by this point).
  if (prev.nowPlaying !== playingNow) {
    const sequence =
      show?.playingNowSequence ?? (show?.sequences || []).find((seq) => seq?.displayName === playingNow);
    const duration = Number(sequence?.duration);
    const seed =
      Number.isFinite(duration) && duration > NOW_PLAYING_TIMER_LEAD_SECONDS
        ? duration - NOW_PLAYING_TIMER_LEAD_SECONDS
        : 0;
    return { nowPlaying: playingNow, nowPlayingTimer: seed };
  }

  // Same song -> tick down, floored at 0.
  return {
    nowPlaying: prev.nowPlaying,
    nowPlayingTimer: prev.nowPlayingTimer > 0 ? prev.nowPlayingTimer - 1 : 0
  };
};
