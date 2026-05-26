import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@apollo/client';
import InfoTwoToneIcon from '@mui/icons-material/InfoTwoTone';
import { Grid, CardActions, Divider, Typography, Autocomplete, Switch, TextField, Stack } from '@mui/material';
import _ from 'lodash';

import MainCard from '../../../../ui-component/cards/MainCard';
import StickyFormBar from '../../../../ui-component/StickyFormBar';
import useAutoSave from '../../../../hooks/useAutoSave';

import { savePagesService, savePreferencesService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { UPDATE_PAGES, UPDATE_PREFERENCES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

const ViewerPageSettings = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [updatePagesMutation] = useMutation(UPDATE_PAGES);
  const [updatePreferencesMutation] = useMutation(UPDATE_PREFERENCES);

  const [values, setValues] = useState({
    pageTitle: show?.preferences?.pageTitle || '',
    pageIconUrl: show?.preferences?.pageIconUrl || '',
    selfHostedRedirectUrl: show?.preferences?.selfHostedRedirectUrl || '',
    viewerPageViewOnly: !!show?.preferences?.viewerPageViewOnly,
    makeItSnow: !!show?.preferences?.makeItSnow
  });

  useEffect(() => {
    setValues({
      pageTitle: show?.preferences?.pageTitle || '',
      pageIconUrl: show?.preferences?.pageIconUrl || '',
      selfHostedRedirectUrl: show?.preferences?.selfHostedRedirectUrl || '',
      viewerPageViewOnly: !!show?.preferences?.viewerPageViewOnly,
      makeItSnow: !!show?.preferences?.makeItSnow
    });
  }, [
    show?.preferences?.pageTitle,
    show?.preferences?.pageIconUrl,
    show?.preferences?.selfHostedRedirectUrl,
    show?.preferences?.viewerPageViewOnly,
    show?.preferences?.makeItSnow
  ]);

  const save = useCallback(
    (snapshot) =>
      new Promise((resolve, reject) => {
        const updatedPreferences = _.cloneDeep({ ...show?.preferences, ...snapshot });
        savePreferencesService(updatedPreferences, updatePreferencesMutation, (response) => {
          if (response?.success) {
            dispatch(setShow({ ...show, preferences: updatedPreferences }));
            resolve();
          } else {
            showAlert(dispatch, response?.toast);
            reject(new Error('save failed'));
          }
        });
      }),
    [dispatch, show, updatePreferencesMutation]
  );

  const status = useAutoSave(values, save);

  // Page selection touches a different mutation (UPDATE_PAGES) and is a
  // single-click action — keep the explicit save flow.
  const [viewerPageOptions, setViewerPageOptions] = useState([]);

  const getViewerPageOptions = useCallback(() => {
    const options = [];
    _.forEach(show?.pages, (page) => {
      options.push({ label: page.name, id: page.name, active: page.active });
    });
    setViewerPageOptions(options);
  }, [show]);

  useEffect(() => {
    getViewerPageOptions();
  }, [getViewerPageOptions]);

  const handleViewerPageChange = (_event, value) => {
    const updatedPages = _.cloneDeep([...show?.pages]);
    _.forEach(updatedPages, (page) => {
      page.active = page?.name === value?.id;
    });
    savePagesService(updatedPages, updatePagesMutation, (response) => {
      if (response?.success) {
        // This path only flips `active` on an existing page — pageIds are
        // already populated client-side — but use the server response if
        // available so we stay consistent with the other call sites and
        // pick up any server-side changes (e.g. updatedAt bump).
        const persisted = Array.isArray(response.pages) && response.pages.length > 0
          ? response.pages
          : updatedPages;
        dispatch(setShow({ ...show, pages: [...persisted] }));
      }
      showAlert(dispatch, response?.toast);
    });
  };

  const getSelectedViewerPage = () => {
    let selected = {};
    _.forEach(viewerPageOptions, (option) => {
      if (option.active) selected = option;
    });
    return selected;
  };

  return (
    <>
      <Grid item xs={12}>
        <MainCard content={false}>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Viewer Page View Only</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#viewer-page-view-only',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  If enabled, viewers will not be able to interact with your viewer page (ie. make requests or vote).
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  color="primary"
                  checked={values.viewerPageViewOnly}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, viewerPageViewOnly: v }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Active Viewer Page</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#active-viewer-page',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Sets the current active viewer page.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Autocomplete
                  disableClearable
                  options={viewerPageOptions}
                  value={getSelectedViewerPage()}
                  renderInput={(params) => <TextField {...params} label="" />}
                  onChange={handleViewerPageChange}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Redirect URL</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#self-hosted-redirect-url',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  This would be the URL of the page you want to redirect to when a viewer visits your show page on the main Remote Falcon
                  site. Use this if you are self hosting or want to redirect to a different site (PulseMesh for example).
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  fullWidth
                  label="Self Hosted Redirect URL"
                  value={values.selfHostedRedirectUrl}
                  onChange={(e) => setValues((prev) => ({ ...prev, selfHostedRedirectUrl: e.target.value }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Viewer Page Title</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#viewer-page-title',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Title to display in the Viewer Page browser tab/window.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  fullWidth
                  label="Viewer Page Title"
                  value={values.pageTitle}
                  onChange={(e) => setValues((prev) => ({ ...prev, pageTitle: e.target.value }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Viewer Page Icon URL</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#viewer-page-icon-url',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Image URL for the icon to display in the Viewer Page browser tab/window.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <TextField
                  fullWidth
                  label="Viewer Page Icon URL"
                  value={values.pageIconUrl}
                  onChange={(e) => setValues((prev) => ({ ...prev, pageIconUrl: e.target.value }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
          <CardActions>
            <Grid container alignItems="center" justifyContent="space-between" spacing={2}>
              <Grid item xs={12} md={6} lg={4}>
                <Stack direction="row" spacing={2} pb={1}>
                  <Typography variant="h4">Make it Snow</Typography>
                  <InfoTwoToneIcon
                    onClick={() =>
                      window.open(
                        'https://docs.remotefalcon.com/docs/docs/control-panel/remote-falcon-settings#make-it-snow',
                        '_blank',
                        'noreferrer'
                      )
                    }
                    fontSize="small"
                  />
                </Stack>
                <Typography component="div" variant="caption">
                  Add a snow effect to your viewer page.
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
                <Switch
                  color="primary"
                  checked={values.makeItSnow}
                  onChange={(_e, v) => setValues((prev) => ({ ...prev, makeItSnow: v }))}
                />
              </Grid>
            </Grid>
          </CardActions>
          <Divider />
        </MainCard>
      </Grid>
      <StickyFormBar status={status} />
    </>
  );
};

export default ViewerPageSettings;
