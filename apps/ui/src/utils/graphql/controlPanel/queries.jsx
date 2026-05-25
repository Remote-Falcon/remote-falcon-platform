import { gql } from '@apollo/client';

export const SIGN_IN = gql`
  query @api(name: controlPanel) {
    signIn {
      showToken
      email
      showName
      showSubdomain
      emailVerified
      createdDate
      lastLoginDate
      expireDate
      pluginVersion
      fppVersion
      lastLoginIp
      showRole
      playingNow
      playingNext
      serviceToken
      apiAccess {
        apiAccessActive
        apiAccessToken
      }
      userProfile {
        firstName
        lastName
        facebookUrl
        youtubeUrl
        lastTokenResetDate
      }
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
        managePsa
        sequencesPlayed
        pageTitle
        pageIconUrl
        showOnMap
        selfHostedRedirectUrl
        blockedViewerIps
        notificationPreferences {
          enableFppHeartbeat
          fppHeartbeatIfControlEnabled
          fppHeartbeatRenotifyAfterMinutes
          fppHeartbeatLastNotification
        }
        analyticsBetaOptIn
      }
      sequences {
        name
        key
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
      psaSequences {
        name
        order
        lastPlayed
      }
      pages {
        name
        active
        html
        pageId
        updatedAt
      }
      requests {
        sequence {
          name
        }
        position
        ownerRequested
      }
      votes {
        sequence {
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

export const VERIFY_PASSWORD_RESET_LINK = gql`
  query ($passwordResetLink: String!) @api(name: controlPanel) {
    verifyPasswordResetLink(passwordResetLink: $passwordResetLink) {
      serviceToken
    }
  }
`;

export const GET_SHOW = gql`
  query @api(name: controlPanel) {
    getShow {
      showToken
      email
      showName
      showSubdomain
      emailVerified
      createdDate
      lastLoginDate
      expireDate
      pluginVersion
      fppVersion
      lastLoginIp
      showRole
      playingNow
      playingNext
      serviceToken
      apiAccess {
        apiAccessActive
        apiAccessToken
      }
      userProfile {
        firstName
        lastName
        facebookUrl
        youtubeUrl
        lastTokenResetDate
      }
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
        managePsa
        sequencesPlayed
        pageTitle
        pageIconUrl
        showOnMap
        selfHostedRedirectUrl
        blockedViewerIps
        notificationPreferences {
          enableFppHeartbeat
          fppHeartbeatIfControlEnabled
          fppHeartbeatRenotifyAfterMinutes
          fppHeartbeatLastNotification
        }
        analyticsBetaOptIn
      }
      sequences {
        name
        key
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
      psaSequences {
        name
        order
        lastPlayed
      }
      pages {
        name
        active
        html
        pageId
        updatedAt
      }
      requests {
        sequence {
          name
        }
        position
        ownerRequested
      }
      votes {
        sequence {
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

// V15 — request → play conversion funnel for the Sequences analytics tab.
export const REQUEST_CONVERSION = gql`
  query ($startDate: Long!, $endDate: Long!, $timezone: String) @api(name: controlPanel) {
    requestConversion(startDate: $startDate, endDate: $endDate, timezone: $timezone) {
      attempted
      accepted
      rejected
      conversionRate
      rejectionsByReason {
        reason
        count
      }
    }
  }
`;

// V16 — PSA effectiveness panel for the Sequences analytics tab.
export const PSA_EFFECTIVENESS = gql`
  query ($timezone: String) @api(name: controlPanel) {
    psaEffectiveness(timezone: $timezone) {
      psaPlays {
        name
        lastPlayedMs
        viewersAround
        requestsBefore
        requestsAfter
      }
    }
  }
`;

export const DASHBOARD_LIVE_STATS = gql`
  query ($startDate: Long!, $endDate: Long!, $timezone: String) @api(name: controlPanel) {
    dashboardLiveStats(startDate: $startDate, endDate: $endDate, timezone: $timezone) {
      playingNow
      playingNext
      currentRequests
      totalRequests
      currentVotes
      totalVotes
      currentViewers
      medianDwellSecondsTonight
      lastHeartbeatMs
      heartbeatGaps {
        startedAtMs
        endedAtMs
      }
      versionChanges {
        atMs
        pluginVersion
        fppVersion
      }
    }
  }
`;
export const DASHBOARD_STATS = gql`
  query ($startDate: Long!, $endDate: Long!, $timezone: String) @api(name: controlPanel) {
    dashboardStats(startDate: $startDate, endDate: $endDate, timezone: $timezone) {
      page {
        date
        total
        unique
      }
      jukeboxByDate {
        date
        total
        sequences {
          name
          total
        }
      }
      jukeboxBySequence {
        sequences {
          name
          total
        }
      }
      votingByDate {
        date
        total
        sequences {
          name
          total
        }
      }
      votingBySequence {
        sequences {
          name
          total
        }
      }
      votingWinByDate {
        date
        total
        sequences {
          name
          total
        }
      }
      votingWinBySequence {
        sequences {
          name
          total
        }
      }
    }
  }
`;

export const WRAPPED_SUMMARY = gql`
  query ($token: String!, $season: String!, $year: Int!, $timezone: String) @api(name: controlPanel) {
    wrappedSummary(token: $token, season: $season, year: $year, timezone: $timezone) {
      showName
      season
      year
      startDate
      endDate
      seasonComplete
      activeNights
      uniqueViewers
      totalPageHits
      medianDwellSeconds
      longestDwellSeconds
      mostLoyalRegularNights
      regularsCount
      topRequestedSequence
      topRequestedCount
      topRequestedTotalPlaySeconds
      topVotedSequence
      topVotedCount
      peakNightDate
      peakNightViewers
      peakHour
      peakDayOfWeek
      peakDayOfWeekAvg
    }
  }
`;

export const VIEWER_SESSIONS = gql`
  query ($startDate: Long!, $endDate: Long!, $timezone: String) @api(name: controlPanel) {
    viewerSessions(startDate: $startDate, endDate: $endDate, timezone: $timezone) {
      sessions {
        viewerId
        ipHash
        nightDate
        firstSeen
        lastSeen
        eventCount
        durationSeconds
      }
    }
  }
`;

export const DASHBOARD_STATS_BY_HOUR = gql`
  query ($startDate: Long!, $endDate: Long!, $timezone: String) @api(name: controlPanel) {
    dashboardStatsByHour(startDate: $startDate, endDate: $endDate, timezone: $timezone) {
      buckets {
        date
        hour
        total
        unique
      }
    }
  }
`;

export const SHOWS_ON_MAP = gql`
  query @api(name: controlPanel) {
    showsOnAMap {
      showName
      showLatitude
      showLongitude
    }
  }
`;

export const GET_SHOW_BY_SHOW_NAME = gql`
  query ($showName: String!) @api(name: controlPanel) {
    getShowByShowName(showName: $showName) {
      showToken
      email
      showName
      showSubdomain
      emailVerified
      createdDate
      lastLoginDate
      expireDate
      pluginVersion
      fppVersion
      lastLoginIp
      showRole
      playingNow
      playingNext
      apiAccess {
        apiAccessActive
        apiAccessToken
      }
      userProfile {
        firstName
        lastName
        facebookUrl
        youtubeUrl
      }
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
        managePsa
        sequencesPlayed
        pageTitle
        pageIconUrl
        showOnMap
        selfHostedRedirectUrl
        blockedViewerIps
      }
      sequences {
        name
        key
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
      psaSequences {
        name
        order
        lastPlayed
      }
      pages {
        name
        active
        html
        pageId
        updatedAt
      }
      requests {
        sequence {
          name
        }
        position
        ownerRequested
      }
      votes {
        sequence {
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

export const IMPERSONATE = gql`
  query($showSubdomain: String!) @api(name: controlPanel) {
    impersonateShow(showSubdomain: $showSubdomain) {
      serviceToken
    }
  }
`;

export const GET_SHOWS_AUTO_SUGGEST = gql`
  query($showName: String!) @api(name: controlPanel) {
    getShowsAutoSuggest(showName: $showName)
  }
`;

// Notifications feed for the header bell. Server returns newest-first;
// we still sort defensively in the component (see NotificationsSection).
// `link` is nullable — only release announcements include it.
export const NOTIFICATIONS = gql`
  query @api(name: controlPanel) {
    getNotifications {
      uuid
      type
      subject
      preview
      message
      link
      createdDate
    }
  }
`;

// Admin-only paginated listing of ADMIN-type broadcasts. Used by the
// admin "Send a notification" tab's broadcasts table. Server caps
// `limit` at 100; we default to the table's page size at the call site.
export const LIST_ADMIN_NOTIFICATIONS = gql`
  query ($offset: Int, $limit: Int) @api(name: controlPanel) {
    listAdminNotifications(offset: $offset, limit: $limit) {
      items {
        uuid
        type
        subject
        preview
        message
        link
        createdDate
      }
      total
    }
  }
`;