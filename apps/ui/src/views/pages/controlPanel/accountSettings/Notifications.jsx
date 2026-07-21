import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@apollo/client';
import { Grid, CardActions, Divider, Typography, Switch, Stack, TextField } from '@mui/material';
import _ from 'lodash';

import MainCard from '../../../../ui-component/cards/MainCard';
import StickyFormBar from '../../../../ui-component/StickyFormBar';
import useAutoSave from '../../../../hooks/useAutoSave';
import { store, useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { UPDATE_PREFERENCES, UPDATE_EMAIL_PREFERENCE } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';
import { applyEmailConsent, isHostedBuild } from '../../../../utils/analytics/posthog';
import { savePreferencesService, updateEmailPreferenceService } from '../../../../services/controlPanel/mutations.service';


const Notifications = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);
  const [updateEmailPreferenceMutation, { loading: savingEmailPreference }] = useMutation(UPDATE_EMAIL_PREFERENCE);

  // PRD-013 P0-5 — dedicated save path: marketingOptIn lives on the Show
  // root (not preferences), so it doesn't ride the preferences autosave.
  // On success, PostHog person state is enforced immediately via
  // applyEmailConsent (one capture; the server also enforces opt-outs
  // independently). The dispatch spreads the store's CURRENT show, not
  // this render's closure — the preferences autosave on this same page
  // dispatches its own setShow, and two stale spreads would clobber each
  // other's fields.
  const handleMarketingOptInChange = (optIn) => {
    updateEmailPreferenceService(optIn, updateEmailPreferenceMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...store.getState().show.show, marketingOptIn: optIn }));
        applyEmailConsent(optIn, store.getState().show.show?.email);
      }
      showAlert(dispatch, response?.toast);
    });
  };

  // Combined form state — notification fields nest under `notification`,
  // beta opt-in is a top-level boolean. The save handler maps them back
  // to the right places on `preferences`.
  const [values, setValues] = useState({
    notification: {
      enableFppHeartbeat: !!show?.preferences?.notificationPreferences?.enableFppHeartbeat,
      fppHeartbeatIfControlEnabled: !!show?.preferences?.notificationPreferences?.fppHeartbeatIfControlEnabled,
      fppHeartbeatRenotifyAfterMinutes: show?.preferences?.notificationPreferences?.fppHeartbeatRenotifyAfterMinutes ?? 30
    },
    analyticsBetaOptIn: !!show?.preferences?.analyticsBetaOptIn
  });

  useEffect(() => {
    setValues({
      notification: {
        enableFppHeartbeat: !!show?.preferences?.notificationPreferences?.enableFppHeartbeat,
        fppHeartbeatIfControlEnabled: !!show?.preferences?.notificationPreferences?.fppHeartbeatIfControlEnabled,
        fppHeartbeatRenotifyAfterMinutes: show?.preferences?.notificationPreferences?.fppHeartbeatRenotifyAfterMinutes ?? 30
      },
      analyticsBetaOptIn: !!show?.preferences?.analyticsBetaOptIn
    });
  }, [
    show?.preferences?.notificationPreferences?.enableFppHeartbeat,
    show?.preferences?.notificationPreferences?.fppHeartbeatIfControlEnabled,
    show?.preferences?.notificationPreferences?.fppHeartbeatRenotifyAfterMinutes,
    show?.preferences?.analyticsBetaOptIn
  ]);

  const isValid = useCallback(
    () =>
      Number.isFinite(values.notification.fppHeartbeatRenotifyAfterMinutes) &&
      values.notification.fppHeartbeatRenotifyAfterMinutes >= 5,
    [values]
  );

  const save = useCallback(
    (snapshot) =>
      new Promise((resolve, reject) => {
        const updatedPreferences = _.cloneDeep({
          ...show?.preferences,
          notificationPreferences: {
            ...show?.preferences?.notificationPreferences,
            ...snapshot.notification
          },
          analyticsBetaOptIn: snapshot.analyticsBetaOptIn
        });
        savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
          if (response?.success) {
            // Spread the store's current show (see handleMarketingOptInChange).
            dispatch(setShow({ ...store.getState().show.show, preferences: updatedPreferences }));
            resolve();
          } else {
            showAlert(dispatch, response?.toast);
            reject(new Error('save failed'));
          }
        });
      }),
    [dispatch, show, updatePreferencesMutation]
  );

  const status = useAutoSave(values, save, { isValid });

  return (
    <>
      <Grid item xs={12}>
        <MainCard content={false}>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Typography variant="h4">FPP Plugin Health</Typography>
                <Typography component="div" variant="caption">
                  Enable notifications in the event FPP is no longer communicating with Remote Falcon.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  color="primary"
                  checked={values.notification.enableFppHeartbeat}
                  onChange={(_e, v) =>
                    setValues((prev) => ({
                      ...prev,
                      notification: { ...prev.notification, enableFppHeartbeat: v }
                    }))
                  }
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          {values.notification.enableFppHeartbeat && (
            <>
              <CardActions>
                <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                  <Grid item xs={12} md={6} lg={4} ml={2}>
                    <Typography variant="h4">Notify Only If Viewer Control is Enabled</Typography>
                    <Typography component="div" variant="caption">
                      Send FPP health notifications only if Viewer Control is enabled.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Switch
                      color="primary"
                      checked={values.notification.fppHeartbeatIfControlEnabled}
                      onChange={(_e, v) =>
                        setValues((prev) => ({
                          ...prev,
                          notification: { ...prev.notification, fppHeartbeatIfControlEnabled: v }
                        }))
                      }
                    />
                  </Grid>
                </Grid>
              </CardActions>
              <Divider />
              <CardActions>
                <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                  <Grid item xs={12} md={6} lg={4} ml={2}>
                    <Stack direction="row" spacing={2} pb={1}>
                      <Typography variant="h4">Renotify After Minutes</Typography>
                    </Stack>
                    <Typography component="div" variant="caption">
                      Wait a specified number of minutes before sending another notification (minimum 5).
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <TextField
                      type="number"
                      fullWidth
                      label="Renotify After Minutes"
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          notification: {
                            ...prev.notification,
                            fppHeartbeatRenotifyAfterMinutes: parseInt(e.target.value, 10)
                          }
                        }))
                      }
                      value={
                        Number.isFinite(values.notification.fppHeartbeatRenotifyAfterMinutes)
                          ? values.notification.fppHeartbeatRenotifyAfterMinutes
                          : ''
                      }
                      error={
                        Number.isFinite(values.notification.fppHeartbeatRenotifyAfterMinutes) &&
                        values.notification.fppHeartbeatRenotifyAfterMinutes < 5
                      }
                      helperText={
                        Number.isFinite(values.notification.fppHeartbeatRenotifyAfterMinutes) &&
                        values.notification.fppHeartbeatRenotifyAfterMinutes < 5
                          ? 'Must be at least 5 minutes'
                          : ' '
                      }
                    />
                  </Grid>
                </Grid>
              </CardActions>
            </>
          )}
          <Divider />
        </MainCard>
      </Grid>

      {/* PRD Phase 1 — analytics beta opt-in card */}
      <Grid item xs={12}>
        <MainCard content={false}>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Typography variant="h4">Analytics beta</Typography>
                <Typography component="div" variant="caption">
                  Opt in to experimental Analytics views — concurrent viewers timeline, dwell-time
                  distribution, new vs returning, and season regulars. These rely on the new
                  per-device viewer-id pattern. Toggle off to hide them.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  color="primary"
                  checked={values.analyticsBetaOptIn}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, analyticsBetaOptIn: v }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
        </MainCard>
      </Grid>

      {/* PRD-013 P0-5 — marketing/lifecycle email consent (hosted builds only) */}
      {isHostedBuild && (
        <Grid item xs={12}>
          <MainCard content={false}>
            <Divider />
            <CardActions>
              <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
                <Grid item xs={12} md={6} lg={4}>
                  <Typography variant="h4">Setup tips &amp; seasonal emails</Typography>
                  <Typography component="div" variant="caption">
                    Occasional setup help, feature tips, and seasonal reminders by email. Account emails
                    (verification, password reset) are unaffected.
                  </Typography>
                </Grid>
                <Grid item xs={12} md={6} lg={4}>
                  <Switch
                    color="primary"
                    checked={show?.marketingOptIn === true}
                    disabled={savingEmailPreference}
                    onChange={(_e, v) => handleMarketingOptInChange(v)}
                    inputProps={{ 'aria-label': 'Setup tips and seasonal emails' }}
                  />
                </Grid>
              </Grid>
            </CardActions>
            <Divider />
          </MainCard>
        </Grid>
      )}

      <StickyFormBar status={status} />
    </>
  );
};

export default Notifications;
