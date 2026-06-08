export const addSequenceToQueueService = (addSequenceToQueueMutation, showSubdomain, name, viewerLatitude, viewerLongitude, viewerId, callback) => {
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
      viewerId
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

export const voteForSequenceService = (voteForSequenceMutation, showSubdomain, name, viewerLatitude, viewerLongitude, viewerId, callback) => {
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
      viewerId
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
