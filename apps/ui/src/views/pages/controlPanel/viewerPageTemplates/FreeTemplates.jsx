import { useCallback, useEffect, useState } from 'react';
import * as React from 'react';

import { Grid, CardActions, Autocomplete, TextField, Stack } from '@mui/material';
import _ from 'lodash';

import { getRemoteViewerPageTemplatesFromGithubService } from '../../../../services/controlPanel/viewerPage.service';
import { useDispatch, useSelector } from '../../../../store';
import { unexpectedErrorMessage } from '../../../../store/constant';
import { setRemoteViewerPageTemplates } from '../../../../store/slices/controlPanel';
import { openSnackbar } from '../../../../store/slices/snackbar';
import MainCard from '../../../../ui-component/cards/MainCard';
import ViewerPageTemplatesSkeleton from '../../../../ui-component/cards/Skeleton/ViewerPageTemplatesSkeleton';

import { handleTemplateChange } from './helpers';

// Free templates view — fetches the GitHub-hosted catalog itself so it
// can render directly as a route element (no parent prop drilling).
const FreeTemplates = () => {
  const dispatch = useDispatch();
  const { remoteViewerPageTemplates } = useSelector((state) => state.controlPanel);

  const [showSkeletonLoader, setShowSkeletonLoader] = useState(false);
  const [viewerPageTemplateOptions, setViewerPageTemplateOptions] = useState();
  const [selectedTemplate, setSelectedTemplate] = useState();
  const [selectedTemplateBase64, setSelectedTemplateBase64] = useState();

  const fetchTemplates = useCallback(async () => {
    setShowSkeletonLoader(true);
    try {
      const templates = await getRemoteViewerPageTemplatesFromGithubService();
      dispatch(setRemoteViewerPageTemplates({ ...templates }));
      const options = [];
      _.forEach(templates, (template) => {
        options.push({ label: template?.title, id: template?.key });
      });
      setViewerPageTemplateOptions(options);
      setSelectedTemplateBase64(`data:text/html;base64,${btoa(unescape(encodeURIComponent(templates[0]?.content)))}`);
      setSelectedTemplate(options[0]);
    } catch (err) {
      dispatch(
        openSnackbar({
          open: true,
          message: unexpectedErrorMessage,
          variant: 'alert',
          alert: { color: 'error' },
          close: true
        })
      );
    }
    setShowSkeletonLoader(false);
  }, [dispatch]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  if (showSkeletonLoader) {
    return <ViewerPageTemplatesSkeleton tabOptions={[]} />;
  }

  return (
    <Grid item xs={12}>
      <MainCard content={false}>
        <CardActions>
          <Stack spacing={2}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Autocomplete
                  fullWidth
                  disableClearable
                  value={selectedTemplate}
                  options={viewerPageTemplateOptions}
                  renderInput={(params) => <TextField {...params} label="Template Name" />}
                  onChange={(event, value) =>
                    handleTemplateChange(
                      event,
                      value,
                      remoteViewerPageTemplates,
                      setSelectedTemplate,
                      setSelectedTemplateBase64
                    )
                  }
                />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <iframe title="viewerPagePreview" src={selectedTemplateBase64} style={{ height: '50em', width: '250%' }} />
              </Grid>
            </Grid>
          </Stack>
        </CardActions>
      </MainCard>
    </Grid>
  );
};

export default FreeTemplates;
