import { useState } from 'react';
import * as React from 'react';

import {
  Box,
  Chip,
  Collapse,
  Link as MuiLink,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import { IconAlertCircle, IconAlertTriangle, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import PropTypes from 'prop-types';

// Collapsible "Problems" panel docked under the editor, replacing the
// raw table that used to render html-validate results. Defaults to
// collapsed; header shows error + warning counts so the owner can
// see if there's anything worth expanding without committing screen
// real estate to it.
//
// Click a row's line number → fires `onJumpToLine(line)` which the
// parent threads into Monaco's revealLineInCenter.
const ProblemsPanel = ({ problems, loading, onJumpToLine, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState('all'); // 'all' | 'error' | 'warning'

  const errorCount = problems.filter((p) => p.type === 'error').length;
  const warningCount = problems.filter((p) => p.type === 'warning').length;
  const visible = problems.filter((p) => filter === 'all' || p.type === filter);

  // Auto-open when there are errors and the user hasn't manually toggled
  // (the controlled-open state below honours the manual toggle).
  const summary = (() => {
    if (loading) return 'Validating…';
    if (errorCount === 0 && warningCount === 0) return 'No problems — looks good';
    const parts = [];
    if (errorCount) parts.push(`${errorCount} error${errorCount === 1 ? '' : 's'}`);
    if (warningCount) parts.push(`${warningCount} warning${warningCount === 1 ? '' : 's'}`);
    return parts.join(' · ');
  })();

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper'
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={() => setOpen((v) => !v)}
        sx={{
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' }
        }}
      >
        <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em' }}>
          Problems
        </Typography>
        {!loading && errorCount > 0 && (
          <Chip
            size="small"
            label={errorCount}
            color="error"
            variant="filled"
            sx={{ height: 18, fontSize: 10, fontWeight: 700, '& .MuiChip-label': { px: 0.75 } }}
          />
        )}
        {!loading && warningCount > 0 && (
          <Chip
            size="small"
            label={warningCount}
            color="warning"
            variant="filled"
            sx={{ height: 18, fontSize: 10, fontWeight: 700, '& .MuiChip-label': { px: 0.75 } }}
          />
        )}
        {!loading && errorCount === 0 && warningCount === 0 && (
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }} noWrap>
          {summary}
        </Typography>
        {(errorCount > 0 || warningCount > 0) && open && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filter}
            onChange={(_e, v) => v && setFilter(v)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Filter problems by severity"
          >
            <ToggleButton value="all" sx={{ px: 1, py: 0.1, fontSize: 11 }}>All</ToggleButton>
            <ToggleButton value="error" sx={{ px: 1, py: 0.1, fontSize: 11 }}>Errors</ToggleButton>
            <ToggleButton value="warning" sx={{ px: 1, py: 0.1, fontSize: 11 }}>Warnings</ToggleButton>
          </ToggleButtonGroup>
        )}
        {/* Decorative chevron — parent Stack is the interactive control,
            don't nest an IconButton inside it (WCAG 4.1.2). */}
        <Box aria-hidden sx={{ color: 'text.disabled', display: 'inline-flex', p: 0.5 }}>
          {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </Box>
      </Stack>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', maxHeight: 220, overflowY: 'auto' }}>
          {visible.length === 0 ? (
            <Typography variant="body2" sx={{ p: 2, color: 'text.disabled' }}>
              No {filter === 'all' ? 'problems' : `${filter}s`} to show.
            </Typography>
          ) : (
            <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
              {visible.map((p, i) => (
                <Stack
                  key={`${p.type}-${p.lastLine}-${i}`}
                  direction="row"
                  alignItems="flex-start"
                  spacing={1.5}
                  sx={{ px: 1.5, py: 0.875 }}
                >
                  <Box sx={{ pt: 0.25, color: p.type === 'error' ? 'error.main' : 'warning.main' }}>
                    {p.type === 'error' ? (
                      <IconAlertCircle size={14} stroke={1.75} />
                    ) : (
                      <IconAlertTriangle size={14} stroke={1.75} />
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ flex: 1, fontSize: 12.5, color: 'text.primary' }}>
                    {p.message}
                  </Typography>
                  {p.lastLine && (
                    <Tooltip title="Jump to line">
                      <MuiLink
                        component="button"
                        onClick={() => onJumpToLine(p.lastLine)}
                        sx={{
                          fontSize: 11,
                          color: 'text.secondary',
                          fontVariantNumeric: 'tabular-nums',
                          textDecoration: 'none',
                          '&:hover': { color: 'text.primary', textDecoration: 'underline' }
                        }}
                      >
                        line {p.lastLine}
                      </MuiLink>
                    </Tooltip>
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

ProblemsPanel.propTypes = {
  problems: PropTypes.array.isRequired,
  loading: PropTypes.bool,
  onJumpToLine: PropTypes.func.isRequired,
  defaultOpen: PropTypes.bool
};

export default ProblemsPanel;
