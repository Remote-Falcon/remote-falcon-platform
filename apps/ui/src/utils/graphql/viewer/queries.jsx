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

// Polled every 5s per viewer. Selections here were trimmed to READERS ONLY
// (2026-08-22 audit): the removed fields had zero consumers in the viewer
// tree, and two were live privacy leaks re-sent to every visitor twelve times
// a minute — activeViewers { ipAddress } (every other viewer's IP; also
// always null, since the resolver's projection excludes it as PII) and the
// show's geofence (showLatitude/showLongitude/allowedRadius — GPS gating is
// enforced server-side; the client only needs locationCheckMethod to know
// whether to prompt). On a 300-viewer show, activeViewers alone re-sent a
// few hundred rows to all 300 viewers every 5 seconds — the only selection
// whose payload scaled with the show's own popularity.
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
        jukeboxDepth
        locationCheckMethod
        dailyVoteLimit
        locationCode
        nightlyPlayLimit
        makeItSnow
        analyticsBetaOptIn
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
      categories {
        name
        displayOrder
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
      }
    }
  }
`;
