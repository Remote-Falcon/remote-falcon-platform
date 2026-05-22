import { gql } from '@apollo/client';

export const SIGN_UP = gql`
  mutation ($firstName: String, $lastName: String, $showName: String!) @api(name: controlPanel) {
    signUp(firstName: $firstName, lastName: $lastName, showName: $showName)
  }
`;

export const FORGOT_PASSWORD = gql`
  mutation ($email: String!) @api(name: controlPanel) {
    forgotPassword(email: $email)
  }
`;

export const VERIFY_EMAIL = gql`
  mutation ($showToken: String!) @api(name: controlPanel) {
    verifyEmail(showToken: $showToken)
  }
`;

export const RESET_PASSWORD = gql`
  mutation @api(name: controlPanel) {
    resetPassword
  }
`;

export const UPDATE_PASSWORD = gql`
  mutation @api(name: controlPanel) {
    updatePassword
  }
`;

export const UPDATE_USER_PROFILE = gql`
  mutation ($userProfile: UserProfileInput!) @api(name: controlPanel) {
    updateUserProfile(userProfile: $userProfile)
  }
`;

export const REQUEST_API_ACCESS = gql`
  mutation @api(name: controlPanel) {
    requestApiAccess {
      apiAccessToken
      apiAccessSecret
      apiAccessActive
    }
  }
`;

export const REFRESH_API_SECRET = gql`
  mutation @api(name: controlPanel) {
    refreshApiSecret
  }
`;

export const DELETE_ACCOUNT = gql`
  mutation @api(name: controlPanel) {
    deleteAccount
  }
`;

export const UPDATE_PAGES = gql`
  mutation ($pages: [PageInput]!) @api(name: controlPanel) {
    updatePages(pages: $pages)
  }
`;

export const UPDATE_PREFERENCES = gql`
  mutation ($preferences: PreferenceInput!) @api(name: controlPanel) {
    updatePreferences(preferences: $preferences)
  }
`;

export const UPDATE_PSA_SEQUENCES = gql`
  mutation ($psaSequences: [PsaSequenceInput]!) @api(name: controlPanel) {
    updatePsaSequences(psaSequences: $psaSequences)
  }
`;

export const UPDATE_SEQUENCES = gql`
  mutation ($sequences: [SequenceInput]!) @api(name: controlPanel) {
    updateSequences(sequences: $sequences)
  }
`;

export const UPDATE_SEQUENCE_GROUPS = gql`
  mutation ($sequenceGroups: [SequenceGroupInput]!) @api(name: controlPanel) {
    updateSequenceGroups(sequenceGroups: $sequenceGroups)
  }
`;

export const UPDATE_SHOW = gql`
  mutation ($email: String!, $showName: String!) @api(name: controlPanel) {
    updateShow(email: $email, showName: $showName)
  }
`;

export const PLAY_SEQUENCE_FROM_CONTROL_PANEL = gql`
  mutation ($sequence: SequenceInput!) @api(name: controlPanel) {
    playSequenceFromControlPanel(sequence: $sequence)
  }
`;

export const DELETE_SINGLE_REQUEST = gql`
  mutation ($position: Int!) @api(name: controlPanel) {
    deleteSingleRequest(position: $position)
  }
`;

export const DELETE_ALL_REQUESTS = gql`
  mutation @api(name: controlPanel) {
    deleteAllRequests
  }
`;

export const RESET_ALL_VOTES = gql`
  mutation @api(name: controlPanel) {
    resetAllVotes
  }
`;

export const ADMIN_UPDATE_SHOW = gql`
  mutation ($show: ShowInput!) @api(name: controlPanel) {
    adminUpdateShow(show: $show)
  }
`;

export const DELETE_NOW_PLAYING = gql`
  mutation @api(name: controlPanel) {
    deleteNowPlaying
  }
`;

export const PURGE_STATS = gql`
  mutation @api(name: controlPanel) {
    purgeStats
  }
`;

export const DELETE_STATS_WITHIN_RANGE = gql`
  mutation ($startDate: Long!, $endDate: Long!, $timezone: String) @api(name: controlPanel) {
    deleteStatsWithinRange(startDate: $startDate, endDate: $endDate, timezone: $timezone)
  }
`;

// Admin notification CRUD. Used by the admin "Send a notification" tab.
//
// createNotification — type=ADMIN broadcast to every logged-in show.
// createNotificationForUser — type=USER targeted at a single show by
//   subdomain.
// updateNotification — edit subject/preview/message/link on an
//   existing ADMIN broadcast in-place. Dismissal state is keyed off
//   uuid client-side, so edits don't resurrect dismissed rows.
// deleteNotification — hard-delete from Mongo; visible rows disappear
//   on the next bell refresh.
export const CREATE_NOTIFICATION = gql`
  mutation ($notification: NotificationInput!) @api(name: controlPanel) {
    createNotification(notification: $notification)
  }
`;

export const CREATE_NOTIFICATION_FOR_USER = gql`
  mutation ($notification: NotificationInput!, $showSubdomain: String!) @api(name: controlPanel) {
    createNotificationForUser(notification: $notification, showSubdomain: $showSubdomain)
  }
`;

export const UPDATE_NOTIFICATION = gql`
  mutation ($uuid: String!, $notification: NotificationInput!) @api(name: controlPanel) {
    updateNotification(uuid: $uuid, notification: $notification)
  }
`;

export const DELETE_NOTIFICATION = gql`
  mutation ($uuid: String!) @api(name: controlPanel) {
    deleteNotification(uuid: $uuid)
  }
`;

