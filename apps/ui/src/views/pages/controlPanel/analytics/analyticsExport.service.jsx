import fileDownload from 'js-file-download';
import moment from 'moment-timezone';

import axios from '../../../../utils/axios';
import { showAlert } from '../../globalPageHelpers';

// Stats CSV export. The endpoint is named ...ToExcel for historical reasons
// but has always emitted text/csv — do not "fix" the name, it is the live
// deployed route.
//
// One file per click: the whole selected date range, every section. The
// compare-to-prior toggle is deliberately ignored — the export is the
// selected range only.

// Windows/macOS both choke on these; strip rather than substitute so the
// name stays readable.
const FS_UNSAFE = /[\\/:*?"<>|]/g;

// The server sets `Content-Disposition: filename=stats.csv`, but the header
// never reaches the user — js-file-download names the blob client-side. The
// old dashboard passed a constant, so exporting two ranges silently
// overwrote the first file in the downloads folder.
export const buildStatsExportFilename = (showSubdomain, range, timezone) => {
  const zone = timezone || 'America/New_York';
  const safeSubdomain = (showSubdomain || '').replace(FS_UNSAFE, '').trim();
  const rangeLabel =
    range?.start != null && range?.end != null
      ? `${moment.tz(range.start, zone).format('YYYY-MM-DD')}-${moment.tz(range.end, zone).format('YYYY-MM-DD')}`
      : '';
  return `${['Remote Falcon Stats', safeSubdomain, rangeLabel].filter(Boolean).join(' ')}.csv`;
};

// Section layout emitted by the backend, per stat family:
//   <bare section title>
//   "Col","Col"        <- column header row, quoted
//   "val","val"        <- data rows, quoted
// Every value goes through CSV quoting, so an unquoted line is a section
// title. An empty date range still returns 200 with all titles + header
// rows and zero data rows; this is how we tell that apart.
export const countCsvDataRows = (csvText) => {
  let rows = 0;
  let inSection = false;
  for (const rawLine of String(csvText || '').split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('"')) {
      inSection = false;
    } else if (!inSection) {
      inSection = true;
    } else {
      rows += 1;
    }
  }
  return rows;
};

const readCsvText = async (blob) => {
  if (typeof blob?.text !== 'function') return null;
  try {
    return await blob.text();
  } catch {
    return null;
  }
};

const downloadStatsExportService = async (timezone, dateFilterStart, dateFilterEnd) =>
  axios.post(
    `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/downloadStatsToExcel`,
    {
      timezone,
      dateFilterStart,
      dateFilterEnd
    },
    { responseType: 'blob' }
  );

export const downloadStatsExport = async (dispatch, { showSubdomain, timezone, range }, setIsExporting) => {
  setIsExporting(true);
  try {
    const response = await downloadStatsExportService(timezone, range?.start, range?.end);
    if (response?.status === 200) {
      fileDownload(response.data, buildStatsExportFilename(showSubdomain, range, timezone));
      // An unreadable body is not evidence of an empty range, so only warn
      // when we actually counted zero rows.
      const csvText = await readCsvText(response.data);
      if (csvText != null && countCsvDataRows(csvText) === 0) {
        showAlert(dispatch, {
          message: 'No stats in the selected date range — the exported file has headers only',
          alert: 'warning'
        });
      } else {
        showAlert(dispatch, { message: 'Stats exported' });
      }
    } else {
      showAlert(dispatch, { alert: 'error' });
    }
  } catch {
    showAlert(dispatch, { alert: 'error' });
  } finally {
    setIsExporting(false);
  }
};
