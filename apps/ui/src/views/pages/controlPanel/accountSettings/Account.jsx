import { useState } from 'react';

import { useMutation } from '@apollo/client';
import ContentCopyTwoToneIcon from '@mui/icons-material/ContentCopyTwoTone';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { Grid, CardActions, Divider, Typography, Modal, IconButton, Tooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import MainCard from '../../../../ui-component/cards/MainCard';
import RFLoadingButton from '../../../../ui-component/RFLoadingButton';

import useAuth from '../../../../hooks/useAuth';
import { deleteAccountService, requestApiAccessService, refreshApiSecretService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { DELETE_ACCOUNT, REQUEST_API_ACCESS, REFRESH_API_SECRET } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';
import DeleteAccountModal from './DeleteAccount.modal';
import RefreshApiSecretModal from './RefreshApiSecret.modal';

const Account = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const { logout } = useAuth();
  const { show } = useSelector((state) => state.show);

  const [showShowToken, setShowShowToken] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [isRequestingApi, setIsRequestingApi] = useState(false);
  const [isRefreshingSecret, setIsRefreshingSecret] = useState(false);
  const [refreshedSecret, setRefreshedSecret] = useState(null);
  const [refreshSecretOpen, setRefreshSecretOpen] = useState(false);

  const [requestApiAccessMutation] = useMutation(REQUEST_API_ACCESS);
  const [refreshApiSecretMutation] = useMutation(REFRESH_API_SECRET);
  const [deleteAccountMutation] = useMutation(DELETE_ACCOUNT);

  const copyShowToken = async () => {
    if ('clipboard' in navigator) {
      await navigator.clipboard.writeText(show?.showToken);
    } else {
      document.execCommand('copy', true, show?.showToken);
    }
    showAlert(dispatch, { message: 'Show Token Copied' });
  };

  const copyAccessToken = async () => {
    if ('clipboard' in navigator) {
      await navigator.clipboard.writeText(show?.apiAccess?.apiAccessToken);
    } else {
      document.execCommand('copy', true, show?.apiAccess?.apiAccessToken);
    }
    showAlert(dispatch, { message: 'API Access Token Copied' });
  };

  const copySecretKey = async () => {
    if (!refreshedSecret) return;
    if ('clipboard' in navigator) {
      await navigator.clipboard.writeText(refreshedSecret);
    } else {
      document.execCommand('copy', true, refreshedSecret);
    }
    showAlert(dispatch, { message: 'API Secret Key Copied' });
  };

  const requestApiAccess = () => {
    setIsRequestingApi(true);
    requestApiAccessService(requestApiAccessMutation, (response) => {
      if (response?.success) {
        dispatch(
          setShow({
            ...show,
            apiAccess: response.apiAccess
          })
        );
        setRefreshedSecret(response.apiAccess?.apiAccessSecret);
        trackPosthogEvent('api_access_requested');
      } else {
        trackPosthogEvent('api_access_request_failed', { reason: response?.toast?.message });
      }
      showAlert(dispatch, response?.toast);
      setIsRequestingApi(false);
    });
  };

  const refreshApiSecret = () => {
    setIsRefreshingSecret(true);
    refreshApiSecretService(refreshApiSecretMutation, (response) => {
      if (response?.success) {
        setRefreshedSecret(response.secretKey);
        trackPosthogEvent('api_secret_refreshed');
      } else {
        trackPosthogEvent('api_secret_refresh_failed', { reason: response?.toast?.message });
      }
      showAlert(dispatch, response?.toast);
      setIsRefreshingSecret(false);
      setRefreshSecretOpen(false);
    });
  };

  const handleDeleteAccount = () => {
    setIsDeletingAccount(true);
    deleteAccountService(deleteAccountMutation, (response) => {
      if (response?.success) {
        trackPosthogEvent('account_deleted');
        setIsDeletingAccount(false);
        logout();
      } else {
        trackPosthogEvent('account_delete_failed', { reason: response?.toast?.message });
        showAlert(dispatch, response?.toast);
      }
    });
  };

  return (
    <Grid item xs={12}>
      <MainCard content={false}>
        <Divider />
        <CardActions>
          <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
            <Grid item xs={12} md={6} lg={4}>
              <Typography variant="h4" sx={{ m: 0 }}>
                Show Token
              </Typography>
              <Typography component="div" variant="caption">
                This is your Show Token that will be used in the FPP or xSchedule plugins.
                <br />
                Treat this token like a password, as it allows FPP and xSchedule to communicate with your show page!
              </Typography>
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              {showShowToken ? (
                <span style={{ fontSize: '1.2em' }}>{show?.showToken}</span>
              ) : (
                <span style={{ fontSize: '1.2em' }}>&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
              )}
              <IconButton
                aria-label="toggle password visibility"
                onClick={() => setShowShowToken(!showShowToken)}
                edge="end"
                size="small"
                sx={{ ml: 0.5 }}
              >
                {showShowToken ? <Visibility /> : <VisibilityOff />}
              </IconButton>
              <Tooltip placement="top" title="Copy Show Token">
                <IconButton aria-label="copy show token" onClick={copyShowToken} edge="end" size="small" sx={{ ml: 0.5 }}>
                  <ContentCopyTwoToneIcon />
                </IconButton>
              </Tooltip>
            </Grid>
          </Grid>
        </CardActions>
        <Divider />
        <CardActions>
          <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
            <Grid item xs={12} md={6} lg={4}>
              <Typography variant="h4" sx={{ m: 0 }}>
                Request API Access
              </Typography>
              <Typography component="div" variant="caption">
                Request access to the Remote Falcon API so you can integrate into your own website.
              </Typography>
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <RFLoadingButton
                loading={isRequestingApi}
                onClick={requestApiAccess}
                color="primary"
                disabled={show?.apiAccess?.apiAccessActive}
              >
                {show?.apiAccess?.apiAccessActive ? <span>Access Requested</span> : <span>Request Access</span>}
              </RFLoadingButton>
              {show?.apiAccess?.apiAccessActive && (
                <RFLoadingButton
                  loading={isRefreshingSecret}
                  onClick={() => setRefreshSecretOpen(true)}
                  color="secondary"
                  sx={{ ml: 2 }}
                >
                  Refresh Secret
                </RFLoadingButton>
              )}
              {show?.apiAccess?.apiAccessToken && (
                <Grid item xs={12}>
                  <Typography variant="body2" sx={{ mt: 2, mb: 1, color: theme.palette.success.dark, fontWeight: 'bold' }}>
                    API Access Token:
                  </Typography>
                  <div>
                    {showAccessToken ? (
                      <span className="ph-no-capture" style={{ fontSize: '1.2em' }}>{show?.apiAccess?.apiAccessToken}</span>
                    ) : (
                      <span style={{ fontSize: '1.2em' }}>&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
                    )}
                    <IconButton
                      aria-label="toggle token visibility"
                      onClick={() => setShowAccessToken(!showAccessToken)}
                      edge="end"
                      size="small"
                      sx={{ ml: 0.5 }}
                    >
                      {showAccessToken ? <Visibility /> : <VisibilityOff />}
                    </IconButton>
                    <Tooltip placement="top" title="Copy API Access Token">
                      <IconButton aria-label="copy token" onClick={copyAccessToken} edge="end" size="small" sx={{ ml: 0.5 }}>
                        <ContentCopyTwoToneIcon />
                      </IconButton>
                    </Tooltip>
                  </div>
                </Grid>
              )}
              {refreshedSecret && (
                <Grid item xs={12}>
                  <Typography variant="body2" sx={{ mt: 2, mb: 1, color: theme.palette.error.dark, fontWeight: 'bold' }}>
                    New API Secret Key (copy this now, it will be hidden when you leave):
                  </Typography>
                  <div>
                    {showSecretKey ? (
                      <span className="ph-no-capture" style={{ fontSize: '1.2em' }}>{refreshedSecret}</span>
                    ) : (
                      <span style={{ fontSize: '1.2em' }}>&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
                    )}
                    <IconButton
                      aria-label="toggle secret visibility"
                      onClick={() => setShowSecretKey(!showSecretKey)}
                      edge="end"
                      size="small"
                      sx={{ ml: 0.5 }}
                    >
                      {showSecretKey ? <Visibility /> : <VisibilityOff />}
                    </IconButton>
                    <Tooltip placement="top" title="Copy API Secret Key">
                      <IconButton aria-label="copy secret" onClick={copySecretKey} edge="end" size="small" sx={{ ml: 0.5 }}>
                        <ContentCopyTwoToneIcon />
                      </IconButton>
                    </Tooltip>
                  </div>
                </Grid>
              )}
            </Grid>
          </Grid>
        </CardActions>
        <Divider />
        <CardActions>
          <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
            <Grid item xs={12} md={6} lg={4}>
              <Typography variant="h4" sx={{ m: 0 }}>
                Delete Account
              </Typography>
              <Typography component="div" variant="caption" sx={{ m: 0, color: 'red' }}>
                Warning! This cannot be undone!
              </Typography>
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              <RFLoadingButton onClick={() => setDeleteAccountOpen(true)} color="error">
                Delete Account
              </RFLoadingButton>
            </Grid>
          </Grid>
        </CardActions>
        <Divider />
      </MainCard>
      <Modal
        open={deleteAccountOpen}
        onClose={() => setDeleteAccountOpen(false)}
        aria-labelledby="simple-modal-title"
        aria-describedby="simple-modal-description"
      >
        <DeleteAccountModal
          theme={theme}
          handleClose={() => setDeleteAccountOpen(false)}
          deleteAccount={handleDeleteAccount}
          isDeleting={isDeletingAccount}
        />
      </Modal>
      <Modal
        open={refreshSecretOpen}
        onClose={() => setRefreshSecretOpen(false)}
        aria-labelledby="refresh-secret-modal-title"
        aria-describedby="refresh-secret-modal-description"
      >
        <RefreshApiSecretModal
          theme={theme}
          handleClose={() => setRefreshSecretOpen(false)}
          refreshSecret={refreshApiSecret}
          isRefreshing={isRefreshingSecret}
        />
      </Modal>
    </Grid>
  );
};

export default Account;
