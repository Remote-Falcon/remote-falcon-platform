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

export const DASHBOARD_LIVE_STATS = gql`
  query ($startDate: Long!, $endDate: Long!, $timezone: String) @api(name: controlPanel) {
    dashboardLiveStats(startDate: $startDate, endDate: $endDate, timezone: $timezone) {
      playingNow
      playingNext
      currentRequests
      totalRequests
      currentVotes
      totalVotes
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

export const GET_NOTIFICATIONS = gql`
  query @api(name: controlPanel) {
    getNotifications {
      notification {
        id
        uuid
        createdDate
        preview
        subject
        message
      }
      read
      deleted
    }
  }
`;

export const ASK_WATTSON = gql`
  query($prompt: String!, $previousResponseId: String) @api(name: controlPanel) {
    askWattson(prompt: $prompt, previousResponseId: $previousResponseId) {
        responseId
        text
    }
}
`;

export const GET_WATTSON_FEEDBACK = gql `
  query($filterBy: String) @api(name: controlPanel) {
    getWattsonFeedback(filterBy: $filterBy) {
      showSubdomain
      responseId
      feedback
    }
  }
`;

export const GET_WATTSON_RESPONSE = gql `
  query($responseId: String!) @api(name: controlPanel) {
    getWattsonResponse(responseId: $responseId) {
      prompt
      response
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