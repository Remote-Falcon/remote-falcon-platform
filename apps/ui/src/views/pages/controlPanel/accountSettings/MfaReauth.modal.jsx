import { useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import LoadingButton from '@mui/lab/LoadingButton';
import { CardContent, CardActions, Divider, Grid, IconButton, TextField, Typography, CircularProgress } from '@mui/material';
import PropTypes from 'prop-types';

import MainCard from '../../../../ui-component/cards/MainCard';

// Re-auth gate for disabling 2FA or regenerating recovery codes. The
// backend accepts EITHER the current password (base64 Password header)
// OR a current TOTP code — the toggle switches which one gets sent.
const MfaReauthModal = ({ theme, title, description, confirmLabel, handleClose, onConfirm, isSubmitting }) => {
  const [useCode, setUseCode] = useState(false);
  const [value, setValue] = useState('');

  const confirm = () => {
    if (!value) return;
    onConfirm(useCode ? { code: value } : { password: value });
  };

  return (
    <MainCard
      sx={{
        position: 'absolute',
        width: { xs: 280, lg: 450 },
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }}
      title={title}
      content={false}
      secondary={
        <IconButton onClick={handleClose} size="large">
          <CloseIcon fontSize="small" />
        </IconButton>
      }
    >
      <CardContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {description}
        </Typography>
        <TextField
          fullWidth
          autoFocus
          type={useCode ? 'text' : 'password'}
          label={useCode ? 'Authentication Code' : 'Current Password'}
          value={value}
          onChange={(e) => setValue(e?.target?.value)}
          inputProps={useCode ? { autoComplete: 'one-time-code', inputMode: 'numeric', maxLength: 6 } : { autoComplete: 'current-password' }}
        />
        <Typography
          variant="subtitle1"
          color="secondary"
          onClick={() => {
            setValue('');
            setUseCode(!useCode);
          }}
          sx={{ mt: 1, cursor: 'pointer' }}
        >
          {useCode ? 'Use your password instead' : 'Use an authenticator code instead'}
        </Typography>
      </CardContent>
      <Divider />
      <CardActions>
        <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
          <Grid item>
            <LoadingButton
              loading={isSubmitting}
              loadingIndicator={<CircularProgress color="primary" size={30} />}
              variant="contained"
              size="large"
              sx={{ background: theme.palette.primary.main, '&:hover': { background: theme.palette.primary.dark } }}
              onClick={handleClose}
            >
              Cancel
            </LoadingButton>
          </Grid>
          <Grid item>
            <LoadingButton
              loading={isSubmitting}
              disabled={!value}
              loadingIndicator={<CircularProgress color="error" size={30} />}
              variant="contained"
              size="large"
              sx={{ background: theme.palette.error.main, '&:hover': { background: theme.palette.error.dark } }}
              onClick={confirm}
            >
              {confirmLabel}
            </LoadingButton>
          </Grid>
        </Grid>
      </CardActions>
    </MainCard>
  );
};

MfaReauthModal.propTypes = {
  theme: PropTypes.object,
  title: PropTypes.string,
  description: PropTypes.string,
  confirmLabel: PropTypes.string,
  handleClose: PropTypes.func,
  onConfirm: PropTypes.func,
  isSubmitting: PropTypes.bool
};

export default MfaReauthModal;
