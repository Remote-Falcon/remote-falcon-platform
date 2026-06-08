import { gql } from '@apollo/client';

export const GET_ACTIVE_VIEWER_PAGE = gql`
  query GetActiveViewerPage($showSubdomain: String!) @api(name: viewer) {
    getActiveViewerPage(showSubdomain: $showSubdomain)
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
        locationCode
        hideSequenceCount
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
