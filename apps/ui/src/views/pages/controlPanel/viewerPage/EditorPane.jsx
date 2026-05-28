import { useRef } from 'react';
import * as React from 'react';

import Editor from '@monaco-editor/react';
import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { IconCheck, IconCopy, IconDeviceFloppy, IconExternalLink } from '@tabler/icons-react';
import PropTypes from 'prop-types';

// Monaco editor wrapper for the viewer page HTML.
//
// Owns:
//   • The editor itself (HTML mode)
//   • Save button in a toolbar above the editor (primary CTA when dirty)
//   • Copy HTML button (icon, in the toolbar)
//   • Cmd/Ctrl+S keybinding via Monaco's addCommand (browser default is
//     prevented by Monaco automatically when an editor command claims it)
//   • Programmatic line-jump support (used by the Problems panel)
const EditorPane = ({
  value,
  isDirty,
  lineToFocus,
  onChange,
  onSave,
  onCopy,
  // RF Page Builder integration (PRD External Viewer Page API). When the
  // current page has a stable pageId (post-PR-A schema), surface the
  // cross-product "Edit in RF Page Builder ↗" CTA next to Save. Optional
  // — Monaco stays the default editor; this is an additive entry point.
  onLaunchExternal,
  canLaunchExternal = false,
  launchingExternal = false
}) => {
  const theme = useTheme();
  const editorRef = useRef(null);
  const justCopiedRef = useRef(false);
  const [justCopied, setJustCopied] = React.useState(false);

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    // Cmd/Ctrl + S → save. Monaco's addCommand registers the key as
    // editor-owned, so the browser's Save Page dialog won't fire.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave();
    });
  };

  // Jump to a line when the Problems panel clicks one. revealLineInCenter
  // is more readable than scrolling line-to-top.
  React.useEffect(() => {
    if (lineToFocus && editorRef.current) {
      editorRef.current.revealLineInCenter(lineToFocus);
      editorRef.current.setPosition({ lineNumber: lineToFocus, column: 1 });
      editorRef.current.focus();
    }
  }, [lineToFocus]);

  const handleCopy = async () => {
    await onCopy();
    setJustCopied(true);
    justCopiedRef.current = true;
    setTimeout(() => {
      if (justCopiedRef.current) setJustCopied(false);
    }, 1500);
  };

  return (
    <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="flex-end"
        sx={{ px: 0.5 }}
      >
        <Box sx={{ flex: 1 }}>
          {isDirty && (
            <Typography variant="caption" sx={{ color: 'warning.main' }}>
              Unsaved changes · ⌘S / Ctrl+S to save
            </Typography>
          )}
        </Box>
        <Tooltip title={justCopied ? 'HTML copied' : 'Copy HTML to clipboard'}>
          <IconButton size="small" onClick={handleCopy} aria-label="Copy HTML to clipboard" sx={{ color: 'text.secondary' }}>
            {justCopied ? <IconCheck size={16} stroke={2} /> : <IconCopy size={16} stroke={1.75} />}
          </IconButton>
        </Tooltip>
        {onLaunchExternal && (
          <Tooltip
            title={
              canLaunchExternal
                ? 'Open this page in RF Page Builder (separate product, opens in a new tab)'
                : 'Save the page first to enable the visual editor handoff'
            }
          >
            {/* Tooltip can't wrap a disabled button directly — span wrapper */}
            <span>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<IconExternalLink size={16} stroke={1.75} />}
                onClick={onLaunchExternal}
                disabled={!canLaunchExternal || launchingExternal}
                aria-label="Edit in RF Page Builder (opens external editor)"
              >
                Edit in RF Page Builder
              </Button>
            </span>
          </Tooltip>
        )}
        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={<IconDeviceFloppy size={16} stroke={1.75} />}
          onClick={onSave}
          disabled={!isDirty}
        >
          Save
        </Button>
      </Stack>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        <Editor
          height="60vh"
          defaultLanguage="html"
          value={value ?? ''}
          onChange={(v) => onChange(v ?? '')}
          onMount={handleMount}
          theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'vs'}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            renderWhitespace: 'selection'
          }}
        />
      </Box>
    </Stack>
  );
};

EditorPane.propTypes = {
  value: PropTypes.string,
  isDirty: PropTypes.bool,
  lineToFocus: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  onCopy: PropTypes.func.isRequired,
  onLaunchExternal: PropTypes.func,
  canLaunchExternal: PropTypes.bool,
  launchingExternal: PropTypes.bool
};

export default EditorPane;
