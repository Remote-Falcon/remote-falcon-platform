import { useCallback, useEffect, useMemo, useState } from 'react';
import * as React from 'react';

import { useMutation } from '@apollo/client';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Stack,
  TextField
} from '@mui/material';
import { IconBrush, IconPlus } from '@tabler/icons-react';
import { HtmlValidate } from 'html-validate';
import _ from 'lodash';
import { Link as RouterLink } from 'react-router-dom';

import { savePagesService } from '../../../../services/controlPanel/mutations.service';
import { getRemoteViewerPageTemplatesFromGithubService } from '../../../../services/controlPanel/viewerPage.service';
import { useDispatch, useSelector } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import { setRemoteViewerPageTemplates } from '../../../../store/slices/controlPanel';
import { Environments } from '../../../../utils/enum';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import ConfirmDialog from '../../../../ui-component/ConfirmDialog';
import MainCard from '../../../../ui-component/cards/MainCard';
import PageHead from '../../../../ui-component/PageHead';
import { UPDATE_PAGES } from '../../../../utils/graphql/controlPanel/mutations';
import { showAlert } from '../../globalPageHelpers';

import EditorPane from './EditorPane';
import PageTabsBar from './PageTabsBar';
import PreviewPane from './PreviewPane';
import ProblemsPanel from './ProblemsPanel';

// html-validate runs in the browser; messages whose `message` includes
// any of these substrings are filtered out. They're either rules we
// intentionally bend (inline styles, no end-tag for <br>) or noise from
// owner-authored HTML that the platform doesn't enforce.
const validationExceptions = [
  'instructional-text',
  'Trailing whitespace',
  'Inline style is not allowed',
  'End tag for <br> must be omitted',
  'Anchor link must have a text describing its purpose',
  'Expected omitted end tag <link> instead of self-closing element <link/>',
  '<img> is missing required "alt" attribute',
  'Expected omitted end tag <br> instead of self-closing element <br/>'
];

const htmlValidator = new HtmlValidate({ extends: ['html-validate:recommended'] });
const isException = (message) => validationExceptions.some((ex) => message.includes(ex));

// Max viewer pages per show. Local-env override matches the speeddial
// behavior we're replacing.
const MAX_PAGES = 5;
const canExceedMax = import.meta.env.VITE_HOST_ENV === Environments.LOCAL;

// Starter template option used when no GitHub template is selected. Restores
// the option to scaffold a tiny page without picking from the catalog.
const BLANK_TEMPLATE = { key: '__blank__', title: 'Blank starter', content: '<html>\n  <body>\n    <h1>New page</h1>\n  </body>\n</html>\n' };

const ViewerPage = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const { remoteViewerPageTemplates } = useSelector((state) => state.controlPanel);
  const [updatePagesMutation] = useMutation(UPDATE_PAGES);

  // Source of truth for what's on the server: show.pages from Redux.
  // The dirty buffer holds in-progress edits keyed by page name —
  // editing a tab populates it; saving clears that key.
  const pages = useMemo(() => show?.pages || [], [show?.pages]);
  const [activeIndex, setActiveIndex] = useState(() => {
    const live = (show?.pages || []).findIndex((p) => p.active);
    return live >= 0 ? live : 0;
  });
  const [dirtyMap, setDirtyMap] = useState({}); // { [name]: editedHtml }
  const [problems, setProblems] = useState([]);
  const [validating, setValidating] = useState(false);
  const [lineToFocus, setLineToFocus] = useState(0);
  const [showSidePreview, setShowSidePreview] = useState(true);

  // Modals: confirm + create + nav-guard
  const [confirm, setConfirm] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTemplate, setCreateTemplate] = useState(BLANK_TEMPLATE);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Catalog of starter templates for the create dialog. Lazily fetched the
  // first time the dialog opens; cached in redux thereafter so reopening
  // the dialog is instant.
  const templateOptions = useMemo(() => {
    const remote = Array.isArray(remoteViewerPageTemplates)
      ? remoteViewerPageTemplates
      : Object.values(remoteViewerPageTemplates || {});
    return [BLANK_TEMPLATE, ...remote.filter((t) => t && t.title && t.content)];
  }, [remoteViewerPageTemplates]);

  const openCreate = useCallback(async () => {
    setCreateTemplate(BLANK_TEMPLATE);
    setCreateOpen(true);
    const alreadyLoaded =
      (Array.isArray(remoteViewerPageTemplates) && remoteViewerPageTemplates.length > 0) ||
      Object.keys(remoteViewerPageTemplates || {}).length > 0;
    if (alreadyLoaded) return;
    setTemplatesLoading(true);
    try {
      const templates = await getRemoteViewerPageTemplatesFromGithubService();
      dispatch(setRemoteViewerPageTemplates({ ...templates }));
    } catch (err) {
      trackPosthogEvent('viewer_page_templates_fetch_failed', {
        error: err?.message,
        operation: 'fetch_remote_templates'
      });
      // Non-fatal: user can still create from the blank starter
    }
    setTemplatesLoading(false);
  }, [dispatch, remoteViewerPageTemplates]);

  // Keep activeIndex in range if pages list shrinks
  useEffect(() => {
    if (activeIndex >= pages.length && pages.length > 0) {
      setActiveIndex(pages.length - 1);
    }
  }, [pages.length, activeIndex]);

  const currentPage = pages[activeIndex];
  const currentHtml = currentPage
    ? dirtyMap[currentPage.name] ?? currentPage.html ?? ''
    : '';
  const isCurrentDirty = currentPage ? Object.prototype.hasOwnProperty.call(dirtyMap, currentPage.name) : false;
  const anyDirty = Object.keys(dirtyMap).length > 0;

  // Validate on debounce. Re-run whenever the html changes.
  useEffect(() => {
    let cancelled = false;
    setValidating(true);
    const handle = setTimeout(async () => {
      try {
        const report = await htmlValidator.validateString(currentHtml || '');
        if (cancelled) return;
        const messages = _.orderBy(
          _.flatMap(report?.results ?? [], (result) =>
            (result.messages ?? [])
              .filter((m) => !isException(m.message))
              .map((m) => ({
                type: m.severity === 2 ? 'error' : 'warning',
                message: m.message,
                lastLine: m.line ?? m.location?.line ?? m.offset?.line ?? null
              }))
          ),
          ['lastLine'],
          ['asc']
        );
        setProblems(messages);
      } catch (err) {
        trackPosthogEvent('viewer_page_html_validation_failed', {
          error: err?.message,
          operation: 'html_validate'
        });
        if (!cancelled) setProblems([]);
      } finally {
        if (!cancelled) setValidating(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [currentHtml]);

  // beforeunload — browser tab close / refresh / external nav guard.
  // Standard pattern: setting returnValue triggers the native dialog.
  // Note: in-app SPA navigation does NOT fire beforeunload; that case
  // is handled by the confirm dialog wired into the lifecycle actions
  // below (rename/duplicate/delete/setLive). For sidebar/tab clicks we
  // accept the gap for now — most accidental loss is from refresh/close.
  useEffect(() => {
    if (!anyDirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [anyDirty]);

  // Save handlers ---------------------------------------------------------
  const persistPages = useCallback(
    (updated, successMessage) =>
      new Promise((resolve) => {
        savePagesService(updated, updatePagesMutation, (response) => {
          if (response?.success) {
            dispatch(setShow({ ...show, pages: [...updated] }));
            if (successMessage) showAlert(dispatch, { message: successMessage });
            trackPosthogEvent('viewer_page_saved', {
              page_count: (updated || []).length,
              active_page_count: (updated || []).filter((p) => p?.active).length
            });
            resolve(true);
          } else {
            showAlert(dispatch, response?.toast);
            resolve(false);
          }
        });
      }),
    [dispatch, show, updatePagesMutation]
  );

  const handleSave = useCallback(async () => {
    if (!currentPage || !isCurrentDirty) return;
    const updated = pages.map((p) =>
      p.name === currentPage.name ? { ...p, html: dirtyMap[currentPage.name] } : p
    );
    const ok = await persistPages(updated, `"${currentPage.name}" saved`);
    if (ok) {
      setDirtyMap((m) => {
        const next = { ...m };
        delete next[currentPage.name];
        return next;
      });
    }
  }, [currentPage, isCurrentDirty, pages, dirtyMap, persistPages]);

  const handleEditorChange = useCallback(
    (next) => {
      if (!currentPage) return;
      setDirtyMap((m) => {
        const orig = currentPage.html ?? '';
        if (next === orig) {
          // Back to the saved value — drop the dirty marker
          const copy = { ...m };
          delete copy[currentPage.name];
          return copy;
        }
        return { ...m, [currentPage.name]: next };
      });
    },
    [currentPage]
  );

  const handleCopyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(currentHtml);
    } catch {
      /* ignore */
    }
  }, [currentHtml]);

  // Tab selection guards against losing in-progress edits on the OUTGOING
  // tab. Selecting same tab is a no-op.
  const handleSelect = (i) => {
    if (i === activeIndex) return;
    setActiveIndex(i);
    setLineToFocus(0);
  };

  // Lifecycle actions -----------------------------------------------------
  const handleRename = async (oldName, newName) => {
    const updated = pages.map((p) => (p.name === oldName ? { ...p, name: newName } : p));
    // Move the dirty buffer over to the new name too
    setDirtyMap((m) => {
      if (!Object.prototype.hasOwnProperty.call(m, oldName)) return m;
      const copy = { ...m };
      copy[newName] = copy[oldName];
      delete copy[oldName];
      return copy;
    });
    await persistPages(updated, `Renamed to "${newName}"`);
  };

  const handleDuplicate = async (name) => {
    const src = pages.find((p) => p.name === name);
    if (!src) return;
    // Pick a fresh name: "<name> Copy", or "<name> Copy 2" etc.
    let candidate = `${src.name} Copy`;
    let n = 2;
    while (pages.some((p) => p.name === candidate)) {
      candidate = `${src.name} Copy ${n++}`;
    }
    const updated = [...pages, { name: candidate, html: src.html, active: false }];
    const ok = await persistPages(updated, `Duplicated to "${candidate}"`);
    if (ok) setActiveIndex(updated.length - 1);
  };

  const handleSetLive = async (name) => {
    const updated = pages.map((p) => ({ ...p, active: p.name === name }));
    await persistPages(updated, `"${name}" is now live`);
  };

  const handleDelete = (name) => {
    const target = pages.find((p) => p.name === name);
    if (!target) return;
    if (target.active) {
      showAlert(dispatch, { alert: 'warning', message: 'Cannot delete the live page — set another live first.' });
      return;
    }
    setConfirm({
      title: `Delete "${name}"?`,
      message: 'This permanently deletes this viewer page. The HTML cannot be recovered.',
      confirmLabel: 'Delete',
      action: async () => {
        const updated = pages.filter((p) => p.name !== name);
        const ok = await persistPages(updated, `"${name}" deleted`);
        if (ok) {
          setDirtyMap((m) => {
            const copy = { ...m };
            delete copy[name];
            return copy;
          });
        }
      }
    });
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) return;
    if (pages.some((p) => p.name === name)) {
      showAlert(dispatch, { alert: 'error', message: `A page named "${name}" already exists.` });
      return;
    }
    const html = (createTemplate && createTemplate.content) || BLANK_TEMPLATE.content;
    const updated = [...pages, { name, html, active: false }];
    const ok = await persistPages(updated, `Created "${name}"`);
    if (ok) {
      setCreateOpen(false);
      setCreateName('');
      setCreateTemplate(BLANK_TEMPLATE);
      setActiveIndex(updated.length - 1);
    }
  };

  // Render ----------------------------------------------------------------
  return (
    <Box>
      <PageHead
        title="Viewer Page"
        description="Edit the HTML that powers your show's public viewer page. Up to 5 pages per show; one is live to viewers at a time."
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              to="/control-panel/viewer-page-templates/free"
              variant="outlined"
              color="primary"
              startIcon={<IconBrush size={16} stroke={1.75} />}
            >
              Browse templates
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<IconPlus size={16} stroke={1.75} />}
              onClick={openCreate}
              disabled={!canExceedMax && pages.length >= MAX_PAGES}
            >
              New page
            </Button>
          </Stack>
        }
      />

      <PageTabsBar
        pages={pages}
        activeIndex={activeIndex}
        dirtyMap={dirtyMap}
        maxPages={MAX_PAGES}
        canExceedMax={canExceedMax}
        onSelect={handleSelect}
        onRename={handleRename}
        onDuplicate={handleDuplicate}
        onSetLive={handleSetLive}
        onDelete={handleDelete}
        onCreate={openCreate}
      />

      <MainCard contentSX={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Grid container spacing={2}>
            <Grid item xs={12} lg={showSidePreview ? 7 : 12}>
              <EditorPane
                value={currentHtml}
                isDirty={isCurrentDirty}
                lineToFocus={lineToFocus}
                onChange={handleEditorChange}
                onSave={handleSave}
                onCopy={handleCopyHtml}
              />
            </Grid>
            {showSidePreview && (
              <Grid item xs={12} lg={5}>
                <PreviewPane value={currentHtml} pageName={currentPage?.name} />
              </Grid>
            )}
          </Grid>
          <Stack direction="row" justifyContent="flex-end">
            <Button
              size="small"
              variant="text"
              onClick={() => setShowSidePreview((v) => !v)}
              sx={{ color: 'text.secondary' }}
            >
              {showSidePreview ? 'Hide side preview' : 'Show side preview'}
            </Button>
          </Stack>
          <ProblemsPanel
            problems={problems}
            loading={validating}
            onJumpToLine={(line) => setLineToFocus(line)}
            defaultOpen={problems.some((p) => p.type === 'error')}
          />
        </Stack>
      </MainCard>

      {/* Create-page dialog — name field + starter template picker. The
          template catalog is fetched from GitHub the first time the dialog
          opens and cached in redux. The "Blank starter" option preserves
          the minimal-stub behavior for users who want to start clean. */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New viewer page</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Give your new page a name and pick a starter template. You can rename it later by double-clicking the tab.
          </DialogContentText>
          <Stack spacing={2}>
            <TextField
              autoFocus
              fullWidth
              label="Page name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && createName.trim()) handleCreate();
              }}
              placeholder="e.g. Christmas 2026"
            />
            <Autocomplete
              disableClearable
              value={createTemplate}
              options={templateOptions}
              getOptionLabel={(opt) => opt?.title || ''}
              isOptionEqualToValue={(opt, val) => opt?.key === val?.key}
              loading={templatesLoading}
              onChange={(_e, value) => setCreateTemplate(value || BLANK_TEMPLATE)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Starting template"
                  helperText={templatesLoading ? 'Loading templates from GitHub…' : ' '}
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreateOpen(false); setCreateName(''); setCreateTemplate(BLANK_TEMPLATE); }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={!createName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </Box>
  );
};

export default ViewerPage;
