import { useCallback, useEffect, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import {
  Autocomplete,
  Box,
  Button,
  CardActions,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip
} from '@mui/material';
import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet, IconPlus } from '@tabler/icons-react';
import _ from 'lodash';
import { useNavigate } from 'react-router-dom';

import { savePagesService } from '../../../../services/controlPanel/mutations.service';
import { getRemoteViewerPageTemplatesFromGithubService } from '../../../../services/controlPanel/viewerPage.service';
import { useDispatch, useSelector } from '../../../../store';
import { setRemoteViewerPageTemplates } from '../../../../store/slices/controlPanel';
import { setShow } from '../../../../store/slices/show';
import MainCard from '../../../../ui-component/cards/MainCard';
import ViewerPageTemplatesSkeleton from '../../../../ui-component/cards/Skeleton/ViewerPageTemplatesSkeleton';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { UPDATE_PAGES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

import { handleTemplateChange } from './helpers';

// Free templates view — fetches the GitHub-hosted catalog itself so it
// can render directly as a route element (no parent prop drilling). The
// "Add new page from template" action creates a new (inactive) viewer
// page from the previewed template and navigates to the Viewer Page
// editor so the user can review and set it live themselves.
//
// Device-width toggle matches the pattern from PreviewPane (viewer-page
// editor) — same icons + breakpoints, so users get a consistent preview
// experience across surfaces.
const PREVIEW_WIDTHS = {
  desktop: { width: '100%', maxWidth: 'none', icon: IconDeviceDesktop, label: 'Desktop' },
  tablet: { width: 768, maxWidth: 768, icon: IconDeviceTablet, label: 'Tablet (768px)' },
  mobile: { width: 375, maxWidth: 375, icon: IconDeviceMobile, label: 'Mobile (375px)' }
};

const FreeTemplates = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { show } = useSelector((state) => state.show);
  const { remoteViewerPageTemplates } = useSelector((state) => state.controlPanel);

  const [updatePagesMutation] = useMutation(UPDATE_PAGES);
  const [showSkeletonLoader, setShowSkeletonLoader] = useState(false);
  const [viewerPageTemplateOptions, setViewerPageTemplateOptions] = useState();
  const [selectedTemplate, setSelectedTemplate] = useState();
  const [selectedTemplateBase64, setSelectedTemplateBase64] = useState();

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [applying, setApplying] = useState(false);
  const [device, setDevice] = useState('desktop');

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
      showAlert(dispatch, { alert: 'error' });
    }
    setShowSkeletonLoader(false);
  }, [dispatch]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const openCreate = () => {
    if (!selectedTemplate) return;
    // Prefill the page name with the template title, deduped against existing
    // pages — same dedupe pattern as the "Duplicate page" action.
    const existing = show?.pages || [];
    let candidate = selectedTemplate.label;
    let n = 2;
    while (existing.some((p) => p.name === candidate)) {
      candidate = `${selectedTemplate.label} ${n++}`;
    }
    setCreateName(candidate);
    setCreateOpen(true);
  };

  const createPage = () => {
    const name = createName.trim();
    if (!name) return;
    const existing = show?.pages || [];
    if (existing.some((p) => p.name === name)) {
      showAlert(dispatch, { alert: 'error', message: `A page named "${name}" already exists.` });
      return;
    }
    const template = _.find(remoteViewerPageTemplates, (t) => t?.title === selectedTemplate.label);
    if (!template) {
      showAlert(dispatch, { alert: 'error' });
      return;
    }
    const updated = [...existing, { name, html: template.content, active: false }];

    setApplying(true);
    savePagesService(updated, updatePagesMutation, (response) => {
      setApplying(false);
      if (response?.success) {
        dispatch(setShow({ ...show, pages: updated }));
        setCreateOpen(false);
        setCreateName('');
        showAlert(dispatch, { message: `Created "${name}" — set it live from the Viewer Page editor` });
        trackPosthogEvent('template_applied', {
          template_name: template?.title,
          template_id: template?.key,
          tier: 'free',
          page_count_after: updated.length
        });
        navigate('/control-panel/viewer-page');
      } else {
        showAlert(dispatch, response?.toast || { alert: 'error' });
      }
    });
  };

  if (showSkeletonLoader) {
    return <ViewerPageTemplatesSkeleton tabOptions={[]} />;
  }

  return (
    <Grid container>
      <Grid item xs={12} sx={{ minWidth: 0 }}>
      <MainCard content={false}>
        <CardActions sx={{ display: 'block' }}>
          <Stack spacing={2} sx={{ minWidth: 0 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', sm: 'center' }}
              sx={{ minWidth: 0 }}
            >
              <Autocomplete
                disableClearable
                value={selectedTemplate}
                options={viewerPageTemplateOptions}
                sx={{ width: { xs: '100%', sm: 340 }, flexShrink: 0 }}
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
              <Button
                variant="contained"
                color="primary"
                startIcon={<IconPlus size={16} stroke={1.75} />}
                onClick={openCreate}
                disabled={!selectedTemplate}
                sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Add new page from template
              </Button>
            </Stack>
            <Stack direction="row" justifyContent="flex-end" sx={{ minWidth: 0 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={device}
                onChange={(_e, v) => v && setDevice(v)}
                aria-label="Preview width"
              >
                {Object.entries(PREVIEW_WIDTHS).map(([key, { icon: I, label }]) => (
                  <ToggleButton key={key} value={key} aria-label={label} sx={{ px: 1, py: 0.25 }}>
                    <Tooltip title={label}>
                      <Box sx={{ display: 'inline-flex' }}>
                        <I size={16} stroke={1.75} />
                      </Box>
                    </Tooltip>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
            <Box
              sx={{
                width: '100%',
                minWidth: 0,
                overflow: 'hidden',
                display: 'flex',
                justifyContent: 'center',
                bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.04)'),
                borderRadius: 1,
                p: 1
              }}
            >
              <Box
                component="iframe"
                title="viewerPagePreview"
                src={selectedTemplateBase64}
                sx={{
                  display: 'block',
                  height: '50em',
                  width: PREVIEW_WIDTHS[device].width,
                  maxWidth: PREVIEW_WIDTHS[device].maxWidth,
                  border: 'none',
                  borderRadius: 0.5,
                  bgcolor: '#fff',
                  boxShadow: device === 'desktop' ? 'none' : '0 4px 16px rgba(0,0,0,0.18)',
                  transition: 'width 200ms ease, max-width 200ms ease'
                }}
              />
            </Box>
          </Stack>
        </CardActions>
      </MainCard>

      <Dialog open={createOpen} onClose={() => !applying && setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add page from template</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Creates a new viewer page from &ldquo;{selectedTemplate?.label}&rdquo;. The page is added inactive
            — you can preview it and set it live from the Viewer Page editor.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="Page name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && createName.trim() && !applying) createPage();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreateOpen(false); setCreateName(''); }} disabled={applying}>
            Cancel
          </Button>
          <Button variant="contained" onClick={createPage} disabled={!createName.trim() || applying}>
            {applying ? 'Creating…' : 'Create page'}
          </Button>
        </DialogActions>
      </Dialog>
      </Grid>
    </Grid>
  );
};

export default FreeTemplates;
