// PRD-019 — `locationPermission` is stats-only: the server records it on a
// rejection so the operator's funnel can tell a denied prompt from a viewer who
// is genuinely out of range. It is client-supplied and therefore untrusted, and
// deliberately never reaches the geofence decision.
export const addSequenceToQueueService = (
  addSequenceToQueueMutation,
  showSubdomain,
  name,
  viewerLatitude,
  viewerLongitude,
  viewerId,
  locationPermission,
  callback
) => {
  addSequenceToQueueMutation({
    context: {
      headers: {
        Route: 'Viewer'
      }
    },
    variables: {
      showSubdomain,
      name,
      latitude: parseFloat(viewerLatitude),
      longitude: parseFloat(viewerLongitude),
      viewerId,
      locationPermission
    },
    onCompleted: (response) => {
      callback({
        success: true,
        response
      });
    },
    onError: (error) => {
      callback({
        success: false,
        error
      });
    }
  });
};

export const voteForSequenceService = (
  voteForSequenceMutation,
  showSubdomain,
  name,
  viewerLatitude,
  viewerLongitude,
  viewerId,
  locationPermission,
  callback
) => {
  voteForSequenceMutation({
    context: {
      headers: {
        Route: 'Viewer'
      }
    },
    variables: {
      showSubdomain,
      name,
      latitude: parseFloat(viewerLatitude),
      longitude: parseFloat(viewerLongitude),
      viewerId,
      locationPermission
    },
    onCompleted: (response) => {
      callback({
        success: true,
        response
      });
    },
    onError: (error) => {
      callback({
        success: false,
        error
      });
    }
  });
};
