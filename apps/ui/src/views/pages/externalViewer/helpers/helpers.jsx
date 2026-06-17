// eslint-disable-next-line import/prefer-default-export
import { LocationCheckMethod, ViewerControlMode } from '../../../../utils/enum';

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
  nowPlayingTimer
) => {
  let processedNodes = [];
  if (!viewerControlEnabled) {
    processedNodes = [
      locationCodeNode(<></>),
      sequencesNode(<></>),
      votesNode(<></>),
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
      allNodes(processNodeDefinitions)
    ];
  } else if (viewerControlMode === ViewerControlMode.JUKEBOX) {
    processedNodes = [
      locationCodeNode(<>{locationCode}</>),
      sequencesNode(<>{sequences}</>),
      nowPlayingNode(<>{nowPlaying}</>),
      nowPlayingTimerNode(<>{nowPlayingTimer}</>),
      nextSequenceNode(<>{nextSequence}</>),
      queueSizeNode(<>{queueDepth}</>),
      jukeboxQueueNode(<>{jukeboxRequests}</>),
      votingDynamicContainerNode(<></>),
      votingPlaylistsDynamicContainerNode(<></>),
      locationCheckMethod === LocationCheckMethod.CODE ? blankNode(null) : locationCodeDynamicContainerNode(<></>),
      afterHoursNode(<></>),
      allNodes(processNodeDefinitions)
    ];
  } else {
    processedNodes = [
      locationCodeNode(<>{locationCode}</>),
      sequencesNode(<>{sequences}</>),
      votesNode(<></>),
      nowPlayingNode(<>{nowPlaying}</>),
      nowPlayingTimerNode(<>{nowPlayingTimer}</>),
      nextSequenceNode(<>{nextSequence}</>),
      queueSizeNode(<></>),
      jukeboxQueueNode(<></>),
      jukeboxDynamicContainerNode(<></>),
      jukeboxPlaylistsDynamicContainerNode(<></>),
      locationCheckMethod === LocationCheckMethod.CODE ? blankNode(null) : locationCodeDynamicContainerNode(<></>),
      afterHoursNode(<></>),
      allNodes(processNodeDefinitions)
    ];
  }
  return processedNodes;
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
