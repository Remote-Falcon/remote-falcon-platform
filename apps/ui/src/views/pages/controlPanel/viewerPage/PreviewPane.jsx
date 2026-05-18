import { useState } from 'react';
import * as React from 'react';

import {
  Box,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet, IconMaximize, IconX } from '@tabler/icons-react';
import PropTypes from 'prop-types';

// Live preview of the in-edit HTML — iframe sourced from a base64-encoded
// data URL of `value` so updates render without a save round-trip.
//
// Replaces both the side-preview iframe block and the standalone
// "ViewerPagePreview.dialog.jsx" file — fullscreen is now a button in
// this component's header.
//
// Device-width selector: Desktop (full), Tablet (768px), Mobile (375px).
// Useful because real viewer pages run on phones a lot (per the audit
// in remote-falcon-viewer-page-js/AUDIT.md).
const WIDTHS = {
  desktop: { width: '100%', maxWidth: 'none', icon: IconDeviceDesktop, label: 'Desktop' },
  tablet: { width: 768, maxWidth: 768, icon: IconDeviceTablet, label: 'Tablet (768px)' },
  mobile: { width: 375, maxWidth: 375, icon: IconDeviceMobile, label: 'Mobile (375px)' }
};

const encodeHtml = (html) =>
  `data:text/html;base64,${btoa(unescape(encodeURIComponent(html || '')))}`;

const PreviewPane = ({ value, pageName }) => {
  // `device` is only meaningful in fullscreen mode (inline preview always
  // uses desktop because the side panel is too narrow for tablet/mobile
  // widths). Persist the choice across fullscreen toggles so reopening
  // keeps the user's last selection.
  const [device, setDevice] = useState('desktop');
  const [fullscreen, setFullscreen] = useState(false);
  const src = encodeHtml(value);

  // Renders the iframe at a given device width. Used twice — once inline
  // (always 'desktop'), once in fullscreen (respects `device`).
  const renderIframe = (deviceKey) => {
    const cfg = WIDTHS[deviceKey];
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.04)'),
          borderRadius: 1,
          p: 1,
          minHeight: 0
        }}
      >
        <Box
          component="iframe"
          title={`viewer-page-preview-${pageName || ''}`}
          src={src}
          sx={{
            width: cfg.width,
            maxWidth: cfg.maxWidth,
            height: '100%',
            minHeight: '60vh',
            border: 'none',
            borderRadius: 0.5,
            bgcolor: '#fff',
            boxShadow: deviceKey === 'desktop' ? 'none' : '0 4px 16px rgba(0,0,0,0.18)',
            transition: 'width 200ms ease, max-width 200ms ease'
          }}
        />
      </Box>
    );
  };

  return (
    <>
      <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: '0.06em' }}>
            Preview
          </Typography>
          <Box sx={{ flex: 1 }} />
          {/* Device-width toggle is hidden in the inline side preview —
              the side panel is narrow enough that switching to "Tablet"
              or "Mobile" clips the iframe. Toggle is only shown in
              fullscreen mode below where there's room to actually see
              the difference. */}
          <Tooltip title="Fullscreen preview">
            <IconButton size="small" onClick={() => setFullscreen(true)} aria-label="Open fullscreen preview" sx={{ color: 'text.secondary' }}>
              <IconMaximize size={16} stroke={1.75} />
            </IconButton>
          </Tooltip>
        </Stack>
        {renderIframe('desktop')}
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          Preview renders all page elements regardless of current viewer-control settings.
        </Typography>
      </Stack>

      <Dialog open={fullscreen} onClose={() => setFullscreen(false)} fullScreen>
        <Stack direction="row" alignItems="center" sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h5" sx={{ flex: 1, fontWeight: 600 }}>
            {pageName ? `Preview — ${pageName}` : 'Preview'}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={device}
            onChange={(_e, v) => v && setDevice(v)}
            aria-label="Preview width"
          >
            {Object.entries(WIDTHS).map(([key, { icon: I, label }]) => (
              <ToggleButton key={key} value={key} aria-label={label} sx={{ px: 1, py: 0.25 }}>
                <Tooltip title={label}>
                  <Box sx={{ display: 'inline-flex' }}>
                    <I size={16} stroke={1.75} />
                  </Box>
                </Tooltip>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <IconButton onClick={() => setFullscreen(false)} aria-label="Close fullscreen preview" sx={{ ml: 1 }}>
            <IconX size={20} stroke={1.75} />
          </IconButton>
        </Stack>
        <DialogContent sx={{ p: 2, display: 'flex' }}>{renderIframe(device)}</DialogContent>
      </Dialog>
    </>
  );
};

PreviewPane.propTypes = {
  value: PropTypes.string,
  pageName: PropTypes.string
};

export default PreviewPane;
