import { Buffer } from 'buffer';

import { StatusResponse } from '../../utils/enum';
import { GET_SHOW } from '../../utils/graphql/controlPanel/queries';

export const deleteAccountService = (deleteAccountMutation, callback) => {
  deleteAccountMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    onCompleted: () => {
      callback({
        success: true
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error' }
      });
    }
  });
};

export const playSequenceFromControlPanelService = (sequence, playSequenceFromControlPanelMutation, callback) => {
  playSequenceFromControlPanelMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    variables: {
      sequence
    },
    onCompleted: () => {
      callback({
        success: true,
        toast: { message: `${sequence?.name} Playing Next` }
      });
    },
    onError: (error) => {
      if (error?.message === StatusResponse.OWNER_REQUESTED) {
        callback({
          success: false,
          toast: { alert: 'warning', message: 'You have already requested a sequence' }
        });
      } else {
        callback({
          success: false,
          toast: { alert: 'error' }
        });
      }
    }
    // refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const requestApiAccessService = (requestApiAccessMutation, callback) => {
  requestApiAccessMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    onCompleted: (data) => {
      callback({
        success: true,
        apiAccess: data?.requestApiAccess,
        toast: { message: 'API Access Requested' }
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error' }
      });
    },
    refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const refreshApiSecretService = (refreshApiSecretMutation, callback) => {
  refreshApiSecretMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    onCompleted: (data) => {
      callback({
        success: true,
        secretKey: data?.refreshApiSecret,
        toast: { message: 'API Secret Key Refreshed' }
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error', message: 'Failed to refresh API Secret Key' }
      });
    },
    refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const savePagesService = (updatedPages, updatePagesMutation, callback) => {
  const variables = {
    pages: updatedPages
  };
  updatePagesMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    variables,
    onCompleted: () => {
      callback({
        success: true,
        toast: { message: 'Viewer Pages Saved' }
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error' }
      });
    }
    // refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const savePreferencesService = (updatedPreferences, updatePreferencesMutation, callback) => {
  updatePreferencesMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    variables: {
      preferences: {
        ...updatedPreferences
      }
    },
    onCompleted: () => {
      callback({
        success: true,
        toast: { message: 'Viewer Settings Saved' }
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error' }
      });
    }
    // refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const savePsaSequencesService = (updatedPsaSequences, updatePsaSequencesMutation, callback) => {
  updatePsaSequencesMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    variables: {
      psaSequences: updatedPsaSequences
    },
    onCompleted: () => {
      callback({
        success: true,
        toast: { message: 'Viewer Settings Saved' }
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error' }
      });
    }
    // refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const saveSequencesService = (updatedSequences, updateSequencesMutation, callback) => {
  updateSequencesMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    variables: {
      sequences: updatedSequences
    },
    onCompleted: () => {
      callback({
        success: true,
        toast: { message: 'Sequences Saved' }
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error' }
      });
    }
    // refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const saveSequenceGroupsService = (updatedSequenceGroups, updateSequenceGroupsMutation, callback) => {
  updateSequenceGroupsMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    variables: {
      sequenceGroups: updatedSequenceGroups
    },
    onCompleted: () => {
      callback({
        success: true,
        toast: { message: 'Sequence Group Saved' }
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error' }
      });
    }
    // refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const saveShowService = (updatedShow, updateShowMutation, callback) => {
  updateShowMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    variables: {
      email: updatedShow?.email,
      showName: updatedShow?.showName
    },
    onCompleted: () => {
      callback({
        success: true,
        toast: { message: 'User Profile Saved' }
      });
    },
    onError: (error) => {
      if (error?.message === StatusResponse.SHOW_EXISTS) {
        callback({
          success: false,
          toast: { message: 'That email or show name already exists', alert: 'error' }
        });
      }
    }
    // refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const saveUserProfileService = (updatedUserProfile, updateUserProfileMutation, callback) => {
  updateUserProfileMutation({
    context: {
      headers: {
        Route: 'Control-Panel'
      }
    },
    variables: {
      userProfile: {
        firstName: updatedUserProfile?.firstName,
        lastName: updatedUserProfile?.lastName,
        facebookUrl: updatedUserProfile?.facebookUrl,
        youtubeUrl: updatedUserProfile?.youtubeUrl
      }
    },
    onCompleted: () => {
      callback({
        success: true,
        toast: { message: 'User Profile Saved' }
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error' }
      });
    }
    // refetchQueries: [{ query: GET_SHOW, awaitRefetchQueries: true }]
  });
};

export const updatePasswordService = (currentPassword, newPassword, updatePasswordMutation, callback) => {
  const currentPasswordBase64 = Buffer.from(currentPassword, 'binary').toString('base64');
  const newPasswordBase64 = Buffer.from(newPassword, 'binary').toString('base64');
  updatePasswordMutation({
    context: {
      headers: {
        NewPassword: newPasswordBase64,
        Password: currentPasswordBase64,
        Route: 'Control-Panel'
      }
    },
    onCompleted: () => {
      callback({
        success: true
      });
    },
    onError: () => {
      callback({
        success: false,
        toast: { alert: 'error', message: 'Failed to Update Password' }
      });
    }
  });
};
