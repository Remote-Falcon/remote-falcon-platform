import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';

import { useLazyQuery, useMutation } from '@apollo/client';
import {
  Alert,
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
import { LAUNCH_EXTERNAL_EDITOR, UPDATE_PAGES } from '../../../../utils/graphql/controlPanel/mutations';
import { GET_SHOW } from '../../../../utils/graphql/controlPanel/queries';
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
  const [launchExternalEditorMutation, { loading: launchingExternal }] = useMutation(LAUNCH_EXTERNAL_EDITOR);

  // Lazy refetch for the "page changed externally" detection below. Uses
  // network-only so the cached show doesn't mask a freshly-updated page
  // that RFPB (or a second tab, or a direct API write) just persisted.
  const [refetchShowQuery] = useLazyQuery(GET_SHOW, { fetchPolicy: 'network-only' });

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
  // "This page changed on the server while you were editing." Indexed by
  // page name; the banner above the editor reads from staleNotices[currentPage.name].
  const [staleNotices, setStaleNotices] = useState({});

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

  // External-change detection. When the user returns to this tab (focus
  // or visibilitychange) we refetch the show; if any page's updatedAt
  // moved since the local copy, dispatch the fresh server state into
  // Redux. For pages with unsaved local edits, we ALSO surface a banner
  // so the user knows their buffer is now sitting on top of a moved
  // base (Monaco still shows their edits; the banner just gives them
  // the choice to discard-and-load-server).
  //
  // Triggers RFPB-edit-then-return without requiring any RFPB-side
  // coordination, plus catches second-tab edits and direct API writes.
  // The dispatch (setShow) updates the base used for save-time ETag
  // comparison so the next save doesn't spuriously 412.
  const lastSyncCheckRef = useRef(0);
  // Live ref into dirtyMap so the focus handler reads the current
  // buffer state instead of the captured one at effect-mount time.
  const dirtyMapRef = useRef(dirtyMap);
  useEffect(() => { dirtyMapRef.current = dirtyMap; }, [dirtyMap]);
  // Same for the active show — the focus handler is mounted once and
  // would otherwise close over a stale show reference.
  const showRef = useRef(show);
  useEffect(() => { showRef.current = show; }, [show]);

  useEffect(() => {
    const SYNC_COOLDOWN_MS = 5000;
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastSyncCheckRef.current < SYNC_COOLDOWN_MS) return;
      lastSyncCheckRef.current = now;

      refetchShowQuery({
        context: { headers: { Route: 'Control-Panel' } },
        onCompleted: (data) => {
          const serverShow = data?.getShow;
          const serverPages = serverShow?.pages;
          if (!serverShow || !Array.isArray(serverPages)) return;
          const local = showRef.current;
          const localPages = local?.pages || [];
          const localByName = new Map(localPages.map((p) => [p?.name, p]));
          const dirty = dirtyMapRef.current || {};

          let anyChange = false;
          const newStale = {};
          for (const serverPage of serverPages) {
            const localPage = localByName.get(serverPage?.name);
            if (!localPage) continue; // new/renamed pages handled by the standard mutation flow
            const serverUpdatedAt = serverPage?.updatedAt || '';
            const localUpdatedAt = localPage?.updatedAt || '';
            if (serverUpdatedAt && serverUpdatedAt !== localUpdatedAt) {
              anyChange = true;
              if (Object.prototype.hasOwnProperty.call(dirty, serverPage.name)) {
                // Dirty buffer for this page — record stale notice so the
                // banner surfaces a choice.
                newStale[serverPage.name] = {
                  serverHtml: serverPage.html ?? '',
                  serverUpdatedAt
                };
              }
            }
          }

          if (anyChange) {
            // Always refresh Redux from server — the base used for save-
            // time ETag comparison must be current or the next PUT 412s.
            // Dirty buffers are preserved (separate state).
            //
            // Scope the merge to pages-only to match the convention used
            // by every other setShow call site in this file. The full-
            // Show shallow merge `{...local, ...serverShow}` would let
            // any server-null field clobber the local value (Apollo
            // returns null for missing nested selections); pages is the
            // only field this flow needs to refresh.
            dispatch(setShow({ ...local, pages: serverPages }));
            // Prune dirtyMap + staleNotices for pages that were renamed
            // or deleted on the server. Otherwise the dirty buffer for
            // a no-longer-existing name leaks indefinitely and a future
            // save would re-introduce the old name.
            const serverNames = new Set(serverPages.map((p) => p?.name).filter(Boolean));
            setDirtyMap((m) => {
              const next = { ...m };
              let pruned = false;
              for (const k of Object.keys(next)) {
                if (!serverNames.has(k)) { delete next[k]; pruned = true; }
              }
              return pruned ? next : m;
            });
            // Merge any new stale notices (don't drop existing ones for
            // pages the user hasn't acted on yet).
            if (Object.keys(newStale).length > 0) {
              setStaleNotices((prev) => ({ ...prev, ...newStale }));
            }
            // Prune notices for pages that no longer exist on the server.
            setStaleNotices((prev) => {
              const next = { ...prev };
              let pruned = false;
              for (const k of Object.keys(next)) {
                if (!serverNames.has(k)) { delete next[k]; pruned = true; }
              }
              return pruned ? next : prev;
            });
            // Subtle toast only when nothing was dirty — a stale-notice
            // banner is loud enough on its own when there are dirty
            // edits in play.
            if (Object.keys(newStale).length === 0) {
              showAlert(dispatch, { message: 'Viewer pages refreshed from server' });
            }
            trackPosthogEvent('viewer_page_external_change_detected', {
              changed_count: serverPages.filter((sp) => {
                const lp = localByName.get(sp?.name);
                return lp && sp?.updatedAt && sp.updatedAt !== (lp?.updatedAt || '');
              }).length,
              dirty_count: Object.keys(newStale).length
            });
          }
        }
      });
    };

    document.addEventListener('visibilitychange', handleFocusOrVisibility);
    window.addEventListener('focus', handleFocusOrVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.removeEventListener('focus', handleFocusOrVisibility);
    };
  }, [dispatch, refetchShowQuery]);

  // Stale-notice dismiss/accept handlers wired into the banner below.
  const dismissStaleNotice = useCallback((pageName) => {
    setStaleNotices((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, pageName)) return prev;
      const copy = { ...prev };
      delete copy[pageName];
      return copy;
    });
  }, []);

  const loadServerVersion = useCallback((pageName) => {
    // Drop the dirty buffer for this page so Monaco re-reads the freshly-
    // refetched server html out of Redux. We don't separately re-dispatch
    // setShow here — the focus handler already updated Redux to server
    // state; this just abandons the local override.
    setDirtyMap((m) => {
      if (!Object.prototype.hasOwnProperty.call(m, pageName)) return m;
      const copy = { ...m };
      delete copy[pageName];
      return copy;
    });
    dismissStaleNotice(pageName);
    trackPosthogEvent('viewer_page_stale_banner_action', { action: 'discard', page_name: pageName });
  }, [dismissStaleNotice]);

  const dismissStaleNoticeTracked = useCallback((pageName) => {
    dismissStaleNotice(pageName);
    trackPosthogEvent('viewer_page_stale_banner_action', { action: 'dismiss', page_name: pageName });
  }, [dismissStaleNotice]);

  // Save handlers ---------------------------------------------------------
  const persistPages = useCallback(
    (updated, successMessage) =>
      new Promise((resolve) => {
        savePagesService(updated, updatePagesMutation, (response) => {
          if (response?.success) {
            // Prefer the server-returned pages (carries the freshly-minted
            // pageId on new pages); fall back to the local snapshot if the
            // mutation didn't surface them for any reason. The pageId is what
            // unlocks the "Edit in RF Page Builder" button — without this
            // hop a just-created page sits with the button disabled until
            // the next page refresh.
            const persisted = Array.isArray(response.pages) && response.pages.length > 0
              ? response.pages
              : updated;
            // Read show from the ref, not the closure: a focus-refetch
            // landing mid-save would have dispatched setShow already,
            // and the closure's `show` would be stale. Spreading stale
            // show + persisted pages overwrites the freshly-refetched
            // non-pages fields (preferences, sequences, …) with the
            // pre-refetch values.
            const currentShow = showRef.current;
            dispatch(setShow({ ...currentShow, pages: [...persisted] }));
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
    [dispatch, updatePagesMutation]
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

  // RF Page Builder handoff. Mints a launch URL embedding a short-lived
  // HS256 JWT, then redirects the browser to RFPB's /launch route. The
  // user lands signed-in inside RFPB bound to this specific page; their
  // publish-back from there hits external-api's PUT /v1/pages/:id with
  // the ETag we minted into the launch token. See PRD "External Viewer
  // Page API".
  //
  // Disabled if the current page has no pageId yet (shouldn't happen
  // after PR-A's lazy-backfill on read, but defensive).
  const handleLaunchExternal = useCallback(async () => {
    if (!currentPage?.pageId) return;
    if (isCurrentDirty) {
      // Soft warning before launch — Monaco buffer would otherwise be
      // silently lost when the publish-back from RFPB overwrites the
      // page. Decision in the PRD: "save them before continuing or
      // they'll be replaced when you publish back."
      const proceed = window.confirm(
        'You have unsaved code-mode changes in this tab. Continue to RF Page ' +
        "Builder anyway? Your unsaved edits will be lost when you publish " +
        'back from RFPB.'
      );
      if (!proceed) return;
    }
    try {
      const { data } = await launchExternalEditorMutation({
        variables: { pageId: currentPage.pageId }
      });
      const url = data?.launchExternalEditor;
      if (!url) {
        showAlert(dispatch, { alert: 'error', message: 'Could not open RF Page Builder. Try again.' });
        return;
      }
      trackPosthogEvent('viewer_page_launched_external_editor', {
        pageId: currentPage.pageId,
        pageName: currentPage.name
      });
      // Open in a new tab — RFPB is a separate product and users expect
      // to keep the control panel open behind them (matches the
      // IconExternalLink affordance + tooltip wording). noopener strips
      // the window.opener reference (prevents reverse-tabnabbing);
      // noreferrer suppresses the Referer header so the launch JWT in
      // the URL never leaks via referrer.
      //
      // Don't branch on the return value: window.open with noopener returns
      // null in several browsers (Safari, some Chrome builds) EVEN ON
      // SUCCESS, so a "falsy → same-tab fallback" inverts the intent and
      // navigates the originating tab too. If the popup is genuinely
      // blocked, the browser surfaces its own indicator with an "Allow"
      // affordance — better UX than silently navigating the user's
      // control-panel tab into RFPB.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showAlert(dispatch, {
        alert: 'error',
        message: 'Could not open RF Page Builder: ' + (err?.message || 'unknown error')
      });
    }
  }, [currentPage, dispatch, isCurrentDirty, launchExternalEditorMutation]);

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
    // Migrate any stale-notice under the old key so the banner still
    // shows on the renamed tab if the change was unsynced.
    setStaleNotices((n) => {
      if (!Object.prototype.hasOwnProperty.call(n, oldName)) return n;
      const copy = { ...n };
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
          // Drop any stale-notice for the deleted page too; otherwise
          // the entry sits forever in state (harmless visually because
          // the banner only renders for the active page, but a leak
          // nonetheless).
          setStaleNotices((n) => {
            if (!Object.prototype.hasOwnProperty.call(n, name)) return n;
            const copy = { ...n };
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
    <Box data-testid="viewer-page-root">
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
          {currentPage && staleNotices[currentPage.name] && (
            <Alert
              severity="warning"
              action={
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    color="inherit"
                    variant="outlined"
                    onClick={() => {
                      // Destructive — every other destructive action in this
                      // file routes through ConfirmDialog. Mirror the pattern
                      // so the user can't lose work with a single click.
                      const name = currentPage.name;
                      setConfirm({
                        title: `Discard unsaved edits on "${name}"?`,
                        message:
                          'Your local edits will be replaced with the server version. ' +
                          'This cannot be undone.',
                        confirmLabel: 'Discard',
                        action: () => loadServerVersion(name)
                      });
                    }}
                  >
                    Discard mine, load server
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => dismissStaleNoticeTracked(currentPage.name)}
                  >
                    Keep mine
                  </Button>
                </Stack>
              }
            >
              This page was updated on the server (likely from RF Page Builder
              or another tab) while you were editing. Your unsaved edits are
              still in the editor below.
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12} lg={showSidePreview ? 7 : 12}>
              {/* key forces Monaco to remount per page so its model + onChange
                  binding can't carry state across tab switches (the cause of
                  the cross-page HTML bleed reported in issue tracker #146). */}
              <EditorPane
                key={currentPage?.name}
                value={currentHtml}
                isDirty={isCurrentDirty}
                lineToFocus={lineToFocus}
                onChange={handleEditorChange}
                onSave={handleSave}
                onCopy={handleCopyHtml}
                onLaunchExternal={handleLaunchExternal}
                canLaunchExternal={Boolean(currentPage?.pageId)}
                launchingExternal={launchingExternal}
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
