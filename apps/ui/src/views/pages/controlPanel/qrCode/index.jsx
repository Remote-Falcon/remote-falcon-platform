import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';

import { IconCopy, IconDownload, IconRefresh } from '@tabler/icons-react';

import useShowPublicUrl from '../../../../hooks/useShowPublicUrl';
import { useDispatch, useSelector } from '../../../../store';
import { gridSpacing } from '../../../../store/constant';
import MainCard from '../../../../ui-component/cards/MainCard';
import PageHead from '../../../../ui-component/PageHead';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';

import { showAlert } from '../../globalPageHelpers';
import QrPreview from './QrPreview';
import SeasonalPresets from './SeasonalPresets';
import StyleControls from './StyleControls';
import { DEFAULT_STYLE, PNG_SIZES, SEASONAL_PRESETS } from './presets';
import { downloadCard } from './renderCard';
import { evaluateScanSafety, SCAN_REASON_TEXT } from './scanSafety';
import { hasCustomStyle, loadQrStyle, saveQrStyle } from './qrStyleStorage';

const STYLE_KEYS = Object.keys(DEFAULT_STYLE);
const stylesEqual = (a, b) => STYLE_KEYS.every((k) => a[k] === b[k]);

const QrCode = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);
  const subdomain = show?.showSubdomain;
  const publicUrl = useShowPublicUrl();

  const [style, setStyle] = useState(() => loadQrStyle(subdomain));
  const [utmTagged, setUtmTagged] = useState(false);
  const [cardLayout, setCardLayout] = useState(false);
  const [caption, setCaption] = useState('Scan to request your songs!');
  const [pngSize, setPngSize] = useState(1024);
  const [busy, setBusy] = useState(false);

  const previewRef = useRef(null);
  const loadedRef = useRef(Boolean(subdomain));
  const openTrackedRef = useRef(false);
  const warnedRef = useRef('');

  // The show may hydrate after first paint; pick up the persisted style once
  // the subdomain resolves, but never clobber edits already in progress.
  useEffect(() => {
    if (!loadedRef.current && subdomain) {
      setStyle(loadQrStyle(subdomain));
      loadedRef.current = true;
    }
  }, [subdomain]);

  useEffect(() => {
    if (subdomain) saveQrStyle(subdomain, style);
  }, [subdomain, style]);

  useEffect(() => {
    if (!openTrackedRef.current && subdomain) {
      trackPosthogEvent('qr_tab_opened', { had_saved_style: hasCustomStyle(loadQrStyle(subdomain)) });
      openTrackedRef.current = true;
    }
  }, [subdomain]);

  const encodedData = useMemo(() => {
    if (!publicUrl) return '';
    if (!utmTagged) return publicUrl;
    return `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}utm_source=qr&utm_medium=print`;
  }, [publicUrl, utmTagged]);

  const safety = useMemo(() => evaluateScanSafety(style), [style]);
  const activePresetId = useMemo(() => SEASONAL_PRESETS.find((p) => stylesEqual(p.style, style))?.id, [style]);

  // Surface each distinct scan warning to analytics once, so we can see how
  // often operators paint themselves into an unscannable corner.
  useEffect(() => {
    const key = safety.reasons.join(',');
    if (key && key !== warnedRef.current) {
      trackPosthogEvent('qr_scan_warning_shown', { reasons: key });
      warnedRef.current = key;
    } else if (!key) {
      warnedRef.current = '';
    }
  }, [safety.reasons]);

  const updateStyle = (patch) => setStyle((prev) => ({ ...prev, ...patch }));

  const applyPreset = (preset) => {
    setStyle({ ...preset.style });
    trackPosthogEvent('qr_preset_applied', { preset: preset.id });
  };

  const resetStyle = () => setStyle({ ...DEFAULT_STYLE });

  const downloadName = `${subdomain || 'show'}-qr`;

  const trackDownload = (format) =>
    trackPosthogEvent('qr_downloaded', {
      format,
      size: format === 'svg' ? null : pngSize,
      card_layout: format === 'png' && cardLayout,
      has_center_icon: style.emblem !== 'none',
      utm_tagged: utmTagged,
      preset: activePresetId || 'custom'
    });

  const handleDownloadPng = async () => {
    if (!encodedData || busy) return;
    setBusy(true);
    try {
      if (cardLayout) {
        const blob = await previewRef.current.getPngBlob(pngSize);
        await downloadCard(blob, {
          filename: `${downloadName}-card.png`,
          title: show?.showName || subdomain,
          caption,
          fgColor: style.fgColor,
          bgColor: style.bgColor
        });
      } else {
        await previewRef.current.download('png', pngSize, downloadName);
      }
      trackDownload('png');
    } catch {
      showAlert(dispatch, { alert: 'error', message: 'Could not generate the QR image. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSvg = async () => {
    if (!encodedData || busy) return;
    setBusy(true);
    try {
      await previewRef.current.download('svg', 1024, downloadName);
      trackDownload('svg');
    } catch {
      showAlert(dispatch, { alert: 'error', message: 'Could not generate the QR image. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async () => {
    if (!encodedData) return;
    try {
      if ('clipboard' in navigator) {
        await navigator.clipboard.writeText(encodedData);
      } else {
        document.execCommand('copy', true, encodedData);
      }
      showAlert(dispatch, { message: 'Show URL copied' });
    } catch {
      showAlert(dispatch, { alert: 'error', message: 'Could not copy the URL' });
    }
  };

  return (
    <Box data-testid="qr-code-root">
      <PageHead
        title="QR Code"
        description="Generate a branded QR code for your show URL. Style it, check it scans, and download a print-ready PNG, SVG, or yard-sign card."
      />
      <Grid container spacing={gridSpacing}>
        <Grid item xs={12} md={5}>
          <MainCard title="Preview">
            <Stack spacing={2} alignItems="center">
              {encodedData ? (
                <QrPreview
                  ref={previewRef}
                  data={encodedData}
                  style={style}
                  size={280}
                  card={cardLayout ? { title: show?.showName || subdomain, caption } : null}
                />
              ) : (
                <Box sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    Your show URL isn’t available yet.
                  </Typography>
                </Box>
              )}

              <Alert severity={safety.ok ? 'success' : 'warning'} sx={{ width: '100%' }}>
                {safety.ok
                  ? `Looks scannable${safety.ratio ? ` — contrast ${safety.ratio}:1` : ''}.`
                  : safety.reasons.map((r) => SCAN_REASON_TEXT[r]).join(' ')}
              </Alert>

              <Divider flexItem />

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel id="qr-png-size-label">PNG size</InputLabel>
                <Select
                  labelId="qr-png-size-label"
                  label="PNG size"
                  value={pngSize}
                  onChange={(e) => setPngSize(e.target.value)}
                >
                  {PNG_SIZES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s} × {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControlLabel
                control={<Switch checked={cardLayout} onChange={(e) => setCardLayout(e.target.checked)} />}
                label="Yard-sign card (PNG)"
              />
              {cardLayout && (
                <TextField
                  fullWidth
                  size="small"
                  label="Card caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  inputProps={{ maxLength: 60 }}
                />
              )}

              <Stack direction="row" spacing={1.5} sx={{ width: '100%' }}>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<IconDownload size={18} />}
                  disabled={!encodedData || busy}
                  onClick={handleDownloadPng}
                >
                  PNG
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<IconDownload size={18} />}
                  disabled={!encodedData || busy}
                  onClick={handleDownloadSvg}
                >
                  SVG
                </Button>
              </Stack>
            </Stack>
          </MainCard>
        </Grid>

        <Grid item xs={12} md={7}>
          <MainCard
            title="Customize"
            secondary={
              <Tooltip title="Reset to default">
                <Button size="small" color="inherit" startIcon={<IconRefresh size={16} />} onClick={resetStyle}>
                  Reset
                </Button>
              </Tooltip>
            }
          >
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Encoded URL
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    fullWidth
                    size="small"
                    value={encodedData}
                    InputProps={{ readOnly: true }}
                    placeholder="Show URL unavailable"
                  />
                  <Tooltip title="Copy URL">
                    <span>
                      <Button variant="outlined" onClick={copyUrl} disabled={!encodedData} sx={{ minWidth: 0, px: 1.5 }}>
                        <IconCopy size={18} />
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
                <FormControlLabel
                  sx={{ mt: 0.5 }}
                  control={<Switch checked={utmTagged} onChange={(e) => setUtmTagged(e.target.checked)} />}
                  label="Tag with print campaign (utm_source=qr)"
                />
              </Box>

              <Divider />

              <SeasonalPresets activeId={activePresetId} onApply={applyPreset} />

              <Divider />

              <StyleControls style={style} onChange={updateStyle} />
            </Stack>
          </MainCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default QrCode;
