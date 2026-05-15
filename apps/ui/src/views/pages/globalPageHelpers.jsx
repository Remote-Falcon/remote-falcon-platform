import { unexpectedErrorMessage } from '../../store/constant';
import { openSnackbar } from '../../store/slices/snackbar';

// Single, canonical toast/alert dispatcher used everywhere in the UI.
//
// Shape:
//   showAlert(dispatch, { message, alert, id })
//     message — optional human-readable text. Falls back to a generic
//               error string when `alert === 'error'` and no message is
//               provided (matches the service-layer convention).
//     alert   — severity string: 'success' (default), 'warning', 'error',
//               or 'info'. Mapped into `alert.color` inside the Snackbar.
//     id      — optional dedupe key (callers passing the same id rapidly
//               see only the latest toast).
//
// Defensive: if the caller passes `undefined` (e.g. `response?.toast`
// where the service returned nothing), do nothing rather than firing a
// blank snackbar.
// eslint-disable-next-line import/prefer-default-export
export const showAlert = (dispatch, toast) => {
  if (!toast || (toast.message == null && toast.alert == null)) return;
  dispatch(
    openSnackbar({
      id: toast.id,
      open: true,
      message: toast.alert === 'error' && !toast.message ? unexpectedErrorMessage : toast.message,
      alert: {
        color: toast.alert || 'success'
      }
    })
  );
};
