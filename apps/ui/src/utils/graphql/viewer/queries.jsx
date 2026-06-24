import { gql } from '@apollo/client';

export const GET_ACTIVE_VIEWER_PAGE = gql`
  query GetActiveViewerPage($showSubdomain: String!) @api(name: viewer) {
    getActiveViewerPage(showSubdomain: $showSubdomain)
  }
`;

// #162 — per-viewer votes left in the current show session, for the
// "X of N votes left this show" countdown. Separate from getShow (which is
// show-level and polled) because the count is viewer-specific; called on load
// and after each vote. Returns null when no cap is set or the IP is exempt.
export const VOTES_REMAINING = gql`
  query VotesRemaining($showSubdomain: String!, $viewerId: String) @api(name: viewer) {
    votesRemaining(showSubdomain: $showSubdomain, viewerId: $viewerId)
  }
`;

export const GET_SHOW_FOR_VIEWER = gql`
  query GetShowForViewer($showSubdomain: String!) @api(name: viewer) {
    getShow(showSubdomain: $showSubdomain) {
      showSubdomain
      playingNow
      playingNowSequence {
        name
        displayName
        duration
        visible
        index
        order
        imageUrl
        active
        visibilityCount
        type
        group
        category
        artist
      }
      playingNext
      playingNextSequence {
        name
        displayName
        duration
        visible
        index
        order
        imageUrl
        active
        visibilityCount
        type
        group
        category
        artist
      }
      playingNextFromSchedule
      showName
      preferences {
        viewerControlEnabled
        viewerPageViewOnly
        viewerControlMode
        resetVotes
        jukeboxDepth
        locationCheckMethod
        showLatitude
        showLongitude
        allowedRadius
        checkIfVoted
        checkIfRequested
        psaEnabled
        psaFrequency
        jukeboxRequestLimit
        dailyVoteLimit
        locationCode
        hideSequenceCount
        nightlyPlayLimit
        makeItSnow
        analyticsBetaOptIn
        managePsa
        sequencesPlayed
        pageTitle
        pageIconUrl
        selfHostedRedirectUrl
      }
      sequences {
        name
        displayName
        duration
        visible
        index
        order
        imageUrl
        active
        visibilityCount
        type
        group
        category
        artist
        playsToday
      }
      sequenceGroups {
        name
        visibilityCount
      }
      requests {
        sequence {
          index
          imageUrl
          artist
          name
          displayName
        }
        position
        ownerRequested
      }
      votes {
        sequence {
          name
          displayName
        }
        sequenceGroup {
          name
        }
        votes
        lastVoteTime
        ownerVoted
      }
      activeViewers {
        ipAddress
        visitDateTime
      }
    }
  }
`;
