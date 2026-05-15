import { createSlice } from '@reduxjs/toolkit';

// Single global snackbar state. `showAlert` (views/pages/globalPageHelpers)
// is the only callsite that should dispatch `openSnackbar`. Defaults here
// match showAlert's defaults so a partial payload still renders consistently.
const initialState = {
  id: 'snackbar',
  action: false,
  open: false,
  message: '',
  anchorOrigin: {
    vertical: 'top',
    horizontal: 'center'
  },
  variant: 'alert',
  alert: {
    color: 'success',
    variant: 'filled'
  },
  transition: 'Fade',
  close: true,
  actionButton: false
};

const snackbar = createSlice({
  name: 'snackbar',
  initialState,
  reducers: {
    openSnackbar(state, action) {
      const { open, message, anchorOrigin, variant, alert, transition, actionButton, id } = action.payload;

      state.id = id || initialState.id;
      state.action = !state.action;
      state.open = open || initialState.open;
      state.message = message || initialState.message;
      state.anchorOrigin = anchorOrigin || initialState.anchorOrigin;
      state.variant = variant || initialState.variant;
      state.alert = {
        color: alert?.color || initialState.alert.color, // 'success'
        variant: alert?.variant || initialState.alert.variant // 'filled'
      };
      state.transition = transition || initialState.transition;
      state.close = initialState.close;
      state.actionButton = actionButton || initialState.actionButton;
    },

    closeSnackbar(state) {
      state.open = false;
    }
  }
});

export default snackbar.reducer;

export const { closeSnackbar, openSnackbar } = snackbar.actions;
