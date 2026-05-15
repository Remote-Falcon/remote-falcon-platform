import CloseIcon from '@mui/icons-material/Close';
import { Alert, Button, Fade, Grow, IconButton, Slide } from '@mui/material';
import MuiSnackbar from '@mui/material/Snackbar';

import { useDispatch, useSelector } from '../../store';
import { closeSnackbar } from '../../store/slices/snackbar';

// Transition components, keyed by name so the slice can pick one by string.
const TransitionSlideLeft = (props) => <Slide {...props} direction="left" />;
const TransitionSlideUp = (props) => <Slide {...props} direction="up" />;
const TransitionSlideRight = (props) => <Slide {...props} direction="right" />;
const TransitionSlideDown = (props) => <Slide {...props} direction="down" />;
const GrowTransition = (props) => <Grow {...props} />;

const animation = {
  SlideLeft: TransitionSlideLeft,
  SlideUp: TransitionSlideUp,
  SlideRight: TransitionSlideRight,
  SlideDown: TransitionSlideDown,
  Grow: GrowTransition,
  Fade
};

// Global, single-instance snackbar mounted at App level. Renders an MUI
// Alert inside an MuiSnackbar. State lives in the `snackbar` slice and is
// driven by `showAlert(dispatch, {...})` — see views/pages/globalPageHelpers.
const Snackbar = () => {
  const dispatch = useDispatch();
  const { actionButton, anchorOrigin, alert, close, message, open, transition, id } = useSelector(
    (state) => state.snackbar
  );

  const handleClose = (_event, reason) => {
    if (reason === 'clickaway') return;
    dispatch(closeSnackbar());
  };

  return (
    <MuiSnackbar
      id={id}
      TransitionComponent={animation[transition]}
      anchorOrigin={anchorOrigin}
      open={open}
      autoHideDuration={3000}
      onClose={handleClose}
    >
      <Alert
        variant={alert.variant}
        color={alert.color}
        action={
          <>
            {actionButton !== false && (
              <Button size="small" onClick={handleClose} sx={{ color: 'background.paper' }}>
                UNDO
              </Button>
            )}
            {close !== false && (
              <IconButton sx={{ color: 'background.paper' }} size="small" aria-label="close" onClick={handleClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </>
        }
        sx={{
          ...(alert.variant === 'outlined' && {
            bgcolor: 'background.paper'
          })
        }}
      >
        {message}
      </Alert>
    </MuiSnackbar>
  );
};

export default Snackbar;
