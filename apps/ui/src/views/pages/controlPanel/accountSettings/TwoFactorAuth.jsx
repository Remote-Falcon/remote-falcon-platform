import { useEffect, useRef, useState } from 'react';

import { useMutation } from '@apollo/client';
import ContentCopyTwoToneIcon from '@mui/icons-material/ContentCopyTwoTone';
import { Grid, CardActions, Divider, Typography, Chip, Modal, IconButton, Tooltip, TextField, Stack, Box, Alert } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import fileDownload from 'js-file-download';
import QRCodeStyling from 'qr-code-styling';

import MainCard from '../../../../ui-component/cards/MainCard';
import RFLoadingButton from '../../../../ui-component/RFLoadingButton';

import {
  startMfaEnrollmentService,
  confirmMfaEnrollmentService,
  disableMfaService,
  regenerateRecoveryCodesService
} from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import {
  START_MFA_ENROLLMENT,
  CONFIRM_MFA_ENROLLMENT,
  DISABLE_MFA,
  REGENERATE_RECOVERY_CODES
} from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';
import MfaReauthModal from './MfaReauth.modal';

const TwoFactorAuth = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const mfaEnabled = Boolean(show?.mfaEnabled);

  const [enrollment, setEnrollment] = useState(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [isStartingEnrollment, setIsStartingEnrollment] = useState(false);
  const [isConfirmingEnrollment, setIsConfirmingEnrollment] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const qrRef = useRef(null);

  const [startMfaEnrollmentMutation] = useMutation(START_MFA_ENROLLMENT);
  const [confirmMfaEnrollmentMutation] = useMutation(CONFIRM_MFA_ENROLLMENT);
  const [disableMfaMutation] = useMutation(DISABLE_MFA);
  const [regenerateRecoveryCodesMutation] = useMutation(REGENERATE_RECOVERY_CODES);

  useEffect(() => {
    const el = qrRef.current;
    if (!el || !enrollment?.otpauthUri) return;
    const qr = new QRCodeStyling({
      width: 200,
      height: 200,
      type: 'svg',
      data: enrollment.otpauthUri,
      margin: 8,
      dotsOptions: { type: 'square', color: '#000000' },
      backgroundOptions: { color: '#ffffff' }
    });
    el.replaceChildren();
    qr.append(el);
  }, [enrollment?.otpauthUri]);

  const startEnrollment = () => {
    setIsStartingEnrollment(true);
    startMfaEnrollmentService(startMfaEnrollmentMutation, (response) => {
      if (response?.success) {
        setEnrollment(response.enrollment);
        setConfirmCode('');
      } else {
        showAlert(dispatch, response?.toast);
      }
      setIsStartingEnrollment(false);
    });
  };

  const confirmEnrollment = () => {
    setIsConfirmingEnrollment(true);
    confirmMfaEnrollmentService(confirmCode.trim(), confirmMfaEnrollmentMutation, (response) => {
      if (response?.success) {
        trackPosthogEvent('mfa_enrolled');
        setEnrollment(null);
        setConfirmCode('');
        setRecoveryCodes(response.recoveryCodes);
        dispatch(
          setShow({
            ...show,
            mfaEnabled: true
          })
        );
      }
      showAlert(dispatch, response?.toast);
      setIsConfirmingEnrollment(false);
    });
  };

  const disableMfa = (reauth) => {
    setIsDisabling(true);
    disableMfaService(reauth, disableMfaMutation, (response) => {
      if (response?.success) {
        trackPosthogEvent('mfa_disabled');
        setRecoveryCodes(null);
        dispatch(
          setShow({
            ...show,
            mfaEnabled: false
          })
        );
        setDisableOpen(false);
      }
      showAlert(dispatch, response?.toast);
      setIsDisabling(false);
    });
  };

  const regenerateRecoveryCodes = (reauth) => {
    setIsRegenerating(true);
    regenerateRecoveryCodesService(reauth, regenerateRecoveryCodesMutation, (response) => {
      if (response?.success) {
        trackPosthogEvent('mfa_recovery_codes_regenerated');
        setRecoveryCodes(response.recoveryCodes);
        setRegenerateOpen(false);
      }
      showAlert(dispatch, response?.toast);
      setIsRegenerating(false);
    });
  };

  const copySecret = async () => {
    if (!enrollment?.secret) return;
    // Only the async Clipboard API can copy a string we hand it;
    // document.execCommand('copy') copies the DOM selection and ignores its
    // argument, so there's no working fallback — and the secret is already
    // shown on screen for manual entry. Toast only on a real copy.
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      showAlert(dispatch, { message: 'Secret Copied' });
    } catch {
      showAlert(dispatch, { message: 'Could not copy — the secret is shown above for manual entry', alert: 'warning' });
    }
  };

  const downloadRecoveryCodes = () => {
    fileDownload((recoveryCodes ?? []).join('\n'), 'remote-falcon-recovery-codes.txt');
  };

  return (
    <Grid item xs={12}>
      <MainCard content={false}>
        <Divider />
        <CardActions>
          <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
            <Grid item xs={12} md={6} lg={4}>
              <Typography variant="h4" sx={{ m: 0 }}>
                Two-Factor Authentication
                <Chip
                  size="small"
                  label={mfaEnabled ? 'Enabled' : 'Disabled'}
                  color={mfaEnabled ? 'success' : 'default'}
                  sx={{ ml: 1 }}
                />
              </Typography>
              <Typography component="div" variant="caption">
                Add a second sign-in step using an authenticator app (Google Authenticator, 1Password, Authy, etc.).
              </Typography>
            </Grid>
            <Grid item xs={12} md={6} lg={4}>
              {!mfaEnabled && !enrollment && (
                <RFLoadingButton loading={isStartingEnrollment} onClick={startEnrollment} color="primary">
                  Set Up Two-Factor Authentication
                </RFLoadingButton>
              )}
              {mfaEnabled && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <RFLoadingButton loading={isRegenerating} onClick={() => setRegenerateOpen(true)} color="primary">
                    Regenerate Recovery Codes
                  </RFLoadingButton>
                  <RFLoadingButton loading={isDisabling} onClick={() => setDisableOpen(true)} color="error">
                    Disable
                  </RFLoadingButton>
                </Stack>
              )}
            </Grid>
          </Grid>
        </CardActions>
        {enrollment && (
          <>
            <Divider />
            <CardActions>
              <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                <Grid item xs={12} md={6} lg={4}>
                  <Typography variant="h4" sx={{ m: 0 }}>
                    Scan the QR Code
                  </Typography>
                  <Typography component="div" variant="caption">
                    Scan with your authenticator app, or enter the secret manually. Then enter the 6-digit code the app shows to finish
                    setup.
                  </Typography>
                  <Box ref={qrRef} data-testid="mfa-qr" sx={{ mt: 2, '& svg, & canvas': { display: 'block', borderRadius: 1 } }} />
                  <Typography variant="body2" sx={{ mt: 2, mb: 0.5 }}>
                    Manual entry secret:
                  </Typography>
                  <span className="ph-no-capture" style={{ fontFamily: 'monospace', fontSize: '1.1em' }}>
                    {enrollment.secret}
                  </span>
                  <Tooltip placement="top" title="Copy Secret">
                    <IconButton aria-label="copy secret" onClick={copySecret} edge="end" size="small" sx={{ ml: 0.5 }}>
                      <ContentCopyTwoToneIcon />
                    </IconButton>
                  </Tooltip>
                </Grid>
                <Grid item xs={12} md={6} lg={4}>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      label="6-Digit Code"
                      value={confirmCode}
                      onChange={(e) => setConfirmCode(e?.target?.value)}
                      inputProps={{ autoComplete: 'one-time-code', inputMode: 'numeric', maxLength: 6 }}
                    />
                    <Stack direction="row" spacing={2}>
                      <RFLoadingButton
                        loading={isConfirmingEnrollment}
                        disabled={confirmCode.trim().length < 6}
                        onClick={confirmEnrollment}
                        color="primary"
                      >
                        Verify &amp; Enable
                      </RFLoadingButton>
                      <RFLoadingButton
                        onClick={() => {
                          setEnrollment(null);
                          setConfirmCode('');
                        }}
                        color="error"
                        variant="outlined"
                        sx={{}}
                      >
                        Cancel Setup
                      </RFLoadingButton>
                    </Stack>
                  </Stack>
                </Grid>
              </Grid>
            </CardActions>
          </>
        )}
        {recoveryCodes && (
          <>
            <Divider />
            <CardActions>
              <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                <Grid item xs={12} md={6} lg={4}>
                  <Typography variant="h4" sx={{ m: 0 }}>
                    Recovery Codes
                  </Typography>
                  <Typography component="div" variant="caption">
                    Each code can be used once to sign in if you lose access to your authenticator app.
                  </Typography>
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    Save these codes now — they will not be shown again.
                  </Alert>
                </Grid>
                <Grid item xs={12} md={6} lg={4}>
                  <Box className="ph-no-capture" sx={{ fontFamily: 'monospace', fontSize: '1.1em', lineHeight: 1.8, mb: 2 }}>
                    {recoveryCodes.map((code) => (
                      <div key={code}>{code}</div>
                    ))}
                  </Box>
                  <RFLoadingButton onClick={downloadRecoveryCodes} color="primary">
                    Download Codes
                  </RFLoadingButton>
                </Grid>
              </Grid>
            </CardActions>
          </>
        )}
        <Divider />
      </MainCard>
      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        aria-labelledby="disable-mfa-modal-title"
        aria-describedby="disable-mfa-modal-description"
      >
        <MfaReauthModal
          theme={theme}
          title="Disable Two-Factor Authentication"
          description="Disabling two-factor authentication makes your account less secure. Confirm with your current password or a code from your authenticator app."
          confirmLabel="Disable"
          handleClose={() => setDisableOpen(false)}
          onConfirm={disableMfa}
          isSubmitting={isDisabling}
        />
      </Modal>
      <Modal
        open={regenerateOpen}
        onClose={() => setRegenerateOpen(false)}
        aria-labelledby="regenerate-recovery-codes-modal-title"
        aria-describedby="regenerate-recovery-codes-modal-description"
      >
        <MfaReauthModal
          theme={theme}
          title="Regenerate Recovery Codes"
          description="This replaces ALL of your existing recovery codes with a new set. Confirm with your current password or a code from your authenticator app."
          confirmLabel="Regenerate"
          handleClose={() => setRegenerateOpen(false)}
          onConfirm={regenerateRecoveryCodes}
          isSubmitting={isRegenerating}
        />
      </Modal>
    </Grid>
  );
};

export default TwoFactorAuth;
