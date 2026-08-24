import { gql } from '@apollo/client';

export const INSERT_VIEWER_PAGE_STATS = gql`
  mutation InsertViewerPageStats($showSubdomain: String!, $date: DateTime!, $viewerId: String) @api(name: viewer) {
    insertViewerPageStats(showSubdomain: $showSubdomain, date: $date, viewerId: $viewerId)
  }
`;

export const UPDATE_ACTIVE_VIEWERS = gql`
  mutation UpdateActiveViewers($showSubdomain: String!) @api(name: viewer) {
    updateActiveViewers(showSubdomain: $showSubdomain)
  }
`;

export const ADD_SEQUENCE_TO_QUEUE = gql`
  mutation AddSequenceToQueue($showSubdomain: String!, $name: String!, $latitude: Float, $longitude: Float, $viewerId: String, $locationPermission: String) @api(name: viewer) {
    addSequenceToQueue(showSubdomain: $showSubdomain, name: $name, latitude: $latitude, longitude: $longitude, viewerId: $viewerId, locationPermission: $locationPermission)
  }
`;

// PRD-019 — locationPermission is deliberately NOT sent here: the server never
// added it to voteForSequence (vote denials aren't logged to the rejection
// funnel), and GraphQL rejects unknown arguments before execution. Sending it
// broke every voting-mode show with UnknownArgument (fixed post-#150).
export const VOTE_FOR_SEQUENCE = gql`
  mutation VoteForSequence($showSubdomain: String!, $name: String!, $latitude: Float, $longitude: Float, $viewerId: String) @api(name: viewer) {
    voteForSequence(showSubdomain: $showSubdomain, name: $name, latitude: $latitude, longitude: $longitude, viewerId: $viewerId)
  }
`;
