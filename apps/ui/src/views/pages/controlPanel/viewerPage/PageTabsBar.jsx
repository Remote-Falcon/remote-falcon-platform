import { useRef, useState } from 'react';
import * as React from 'react';

import {
  Box,
  Button,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  IconChevronDown,
  IconCopy,
  IconPencil,
  IconPlus,
  IconRadar,
  IconTrash
} from '@tabler/icons-react';
import PropTypes from 'prop-types';

// Per-page tab strip, replacing the legacy "Manage Viewer Pages" modal.
//
// Each tab shows:
//   • Page name (click to switch, double-click → rename inline)
//   • Tiny • dot if the page is dirty (unsaved edits)
//   • Small green "Live" chip on the active page
//   • Kebab menu: Rename, Duplicate, Set as live, Delete
//
// The "+ New page" button lives at the end of the strip (max 5 pages).
// All page-lifecycle actions ride out from this component so the editor
// host doesn't need to know about modals/state for any of them.
const PageTabsBar = ({
  pages,
  activeIndex,
  dirtyMap,
  maxPages = 5,
  canExceedMax = false,
  onSelect,
  onRename,
  onDuplicate,
  onSetLive,
  onDelete,
  onCreate
}) => {
  const [menuFor, setMenuFor] = useState(null); // { name, anchorEl }
  const [renamingName, setRenamingName] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef(null);

  const openMenu = (e, name) => setMenuFor({ name, anchorEl: e.currentTarget });
  const closeMenu = () => setMenuFor(null);

  const beginRename = (name) => {
    setRenamingName(name);
    setRenameDraft(name);
    closeMenu();
    // Defer focus until the input is in the DOM
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  };

  const commitRename = () => {
    if (!renamingName) return;
    const next = renameDraft.trim();
    if (next && next !== renamingName) {
      const taken = pages.some((p) => p.name === next);
      if (!taken) onRename(renamingName, next);
    }
    setRenamingName(null);
  };

  const cancelRename = () => setRenamingName(null);

  return (
    <Box
      sx={{
        mb: 2,
        borderBottom: (t) =>
          t.palette.mode === 'dark'
            ? '1px solid rgba(255,255,255,0.04)'
            : `1px solid ${t.palette.divider}`
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        sx={{ overflowX: 'auto', pb: 0, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
      >
        {pages.map((page, i) => {
          const isActive = i === activeIndex;
          const isLive = !!page.active;
          const isDirty = !!dirtyMap[page.name];
          const isRenaming = renamingName === page.name;
          return (
            <Stack
              key={page.name}
              direction="row"
              alignItems="center"
              spacing={0.5}
              onClick={() => !isRenaming && onSelect(i)}
              sx={{
                position: 'relative',
                px: 1.5,
                py: 1,
                cursor: isRenaming ? 'text' : 'pointer',
                color: isActive ? 'text.primary' : 'text.secondary',
                borderBottom: '2px solid transparent',
                borderBottomColor: (t) => (isActive ? t.palette.warning.main : 'transparent'),
                mb: '-1px',
                whiteSpace: 'nowrap',
                transition: 'color 150ms ease, border-color 150ms ease',
                '&:hover': { color: 'text.primary' }
              }}
            >
              {isDirty && (
                <Tooltip title="Unsaved changes">
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: 'warning.main',
                      flexShrink: 0
                    }}
                  />
                </Tooltip>
              )}
              {isRenaming ? (
                <TextField
                  inputRef={renameInputRef}
                  value={renameDraft}
                  size="small"
                  variant="standard"
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    else if (e.key === 'Escape') cancelRename();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  sx={{ minWidth: 120 }}
                />
              ) : (
                <Typography
                  variant="body2"
                  sx={{ fontWeight: isActive ? 600 : 500 }}
                  onDoubleClick={() => beginRename(page.name)}
                >
                  {page.name}
                </Typography>
              )}
              {isLive && (
                <Tooltip title="This page is live to viewers">
                  <Chip
                    label="Live"
                    size="small"
                    color="success"
                    variant="filled"
                    sx={{ height: 18, fontSize: 10, fontWeight: 700, '& .MuiChip-label': { px: 0.75 } }}
                  />
                </Tooltip>
              )}
              <Tooltip title="Page actions">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu(e, page.name);
                  }}
                  sx={{
                    ml: 0.25,
                    // Chevron-down reads as a disclosure marker (vs vertical
                    // dots, which were too easy to miss). Always-visible
                    // colour on the active tab; revealed on hover otherwise.
                    color: isActive ? 'text.secondary' : 'transparent',
                    transition: 'color 120ms ease, background-color 120ms ease',
                    border: '1px solid transparent',
                    borderRadius: 0.75,
                    px: 0.5,
                    py: 0.25,
                    '.MuiStack-root:hover &': { color: 'text.secondary' },
                    '&:hover': {
                      color: 'text.primary',
                      bgcolor: (t) => (t.palette.mode === 'dark'
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(15,23,42,0.06)'),
                      borderColor: 'divider'
                    },
                    '&[aria-expanded="true"]': {
                      color: 'text.primary',
                      borderColor: 'divider'
                    }
                  }}
                  aria-expanded={menuFor?.name === page.name ? 'true' : 'false'}
                  aria-label={`Actions for ${page.name}`}
                >
                  <IconChevronDown size={14} stroke={2} />
                </IconButton>
              </Tooltip>
            </Stack>
          );
        })}

        {(canExceedMax || pages.length < maxPages) && (
          <Box sx={{ pl: 1, py: 0.5 }}>
            <Button
              size="small"
              startIcon={<IconPlus size={14} stroke={1.75} />}
              onClick={onCreate}
              sx={{ minWidth: 0 }}
            >
              New page
            </Button>
          </Box>
        )}
      </Stack>

      <Menu
        open={!!menuFor}
        anchorEl={menuFor?.anchorEl}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => beginRename(menuFor?.name)}>
          <ListItemIcon><IconPencil size={16} stroke={1.75} /></ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            const name = menuFor?.name;
            closeMenu();
            onDuplicate(name);
          }}
        >
          <ListItemIcon><IconCopy size={16} stroke={1.75} /></ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={pages.find((p) => p.name === menuFor?.name)?.active}
          onClick={() => {
            const name = menuFor?.name;
            closeMenu();
            onSetLive(name);
          }}
        >
          <ListItemIcon><IconRadar size={16} stroke={1.75} /></ListItemIcon>
          <ListItemText>Set as live</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={pages.find((p) => p.name === menuFor?.name)?.active || pages.length <= 1}
          onClick={() => {
            const name = menuFor?.name;
            closeMenu();
            onDelete(name);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'error.main' }}><IconTrash size={16} stroke={1.75} /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};

PageTabsBar.propTypes = {
  pages: PropTypes.array.isRequired,
  activeIndex: PropTypes.number.isRequired,
  dirtyMap: PropTypes.object.isRequired,
  maxPages: PropTypes.number,
  canExceedMax: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onDuplicate: PropTypes.func.isRequired,
  onSetLive: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired
};

export default PageTabsBar;
