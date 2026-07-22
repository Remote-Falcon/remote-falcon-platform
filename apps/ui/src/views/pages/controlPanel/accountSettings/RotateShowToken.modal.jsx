import CloseIcon from '@mui/icons-material/Close';
import LoadingButton from '@mui/lab/LoadingButton';
import { CardContent, CardActions, Divider, Grid, IconButton, Typography, CircularProgress } from '@mui/material';
import PropTypes from 'prop-types';

import MainCard from '../../../../ui-component/cards/MainCard';

const RotateShowTokenModal = ({ theme, handleClose, rotateToken, isRotating }) => (
  <MainCard
    sx={{
      position: 'absolute',
      width: { xs: 280, lg: 450 },
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    }}
    title="Rotate Show Token"
    content={false}
    secondary={
      <IconButton onClick={handleClose} size="large">
        <CloseIcon fontSize="small" />
      </IconButton>
    }
  >
    <CardContent>
      <Typography variant="body2" sx={{ mt: 2 }}>
        Rotating your Show Token immediately invalidates the current one. Your FPP or xSchedule plugin(s) will{' '}
        <strong>stop syncing with Remote Falcon</strong> until you paste the new token into each plugin&apos;s settings. Only
        rotate if your token has been exposed or you have a reason to replace it. Continue?
      </Typography>
    </CardContent>
    <Divider />
    <CardActions>
      <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
        <Grid item>
          <LoadingButton
            loading={isRotating}
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
          <Grid container alignItems="center" justifyContent="flex-end" spacing={2}>
            <Grid item>
              <LoadingButton
                loading={isRotating}
                loadingIndicator={<CircularProgress color="error" size={30} />}
                variant="contained"
                size="large"
                sx={{ background: theme.palette.error.main, '&:hover': { background: theme.palette.error.dark } }}
                onClick={rotateToken}
              >
                Rotate Token
              </LoadingButton>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </CardActions>
  </MainCard>
);

RotateShowTokenModal.propTypes = {
  theme: PropTypes.object,
  handleClose: PropTypes.func,
  rotateToken: PropTypes.func,
  isRotating: PropTypes.bool
};

export default RotateShowTokenModal;
