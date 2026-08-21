import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../utils/axios', () => ({
  default: { post: vi.fn() }
}));
vi.mock('js-file-download', () => ({ default: vi.fn() }));
vi.mock('../../../globalPageHelpers', () => ({
  showAlert: vi.fn()
}));

import fileDownload from 'js-file-download';
import axios from '../../../../../utils/axios';
import { showAlert } from '../../../globalPageHelpers';

import { buildStatsExportFilename, countCsvDataRows, downloadStatsExport } from '../analyticsExport.service';

// The backend emits one section per stat family: a bare title line, then a
// quoted column-header row, then quoted data rows. An empty range still
// returns HTTP 200 with every title + header row and no data — the shape
// `countCsvDataRows` has to tell apart from a real export.
const SECTIONS = [
  'Unique Page Visits by Date',
  'Total Page Visits by Date',
  'Sequence Requests by Date',
  'Sequence Requests by Sequence',
  'Sequence Votes by Date',
  'Sequence Votes by Sequence',
  'Sequence Wins by Date',
  'Sequence Wins by Sequence'
];

const emptyCsv = SECTIONS.map((title, i) => `${i === 0 ? '' : '\n'}${title}\n"Date","Total"\n`).join('');
const populatedCsv = `${emptyCsv}\nSequence Wins by Sequence\n"Sequence Name","Total Wins"\n"Carol","8"\n`;

// 2023-11-14T22:13:20Z / 2023-11-15T22:13:20Z — deliberately late-UTC so a
// US timezone lands on the PREVIOUS calendar day, pinning that the filename
// is formatted in the show's zone rather than UTC or the test runner's.
const RANGE = { start: 1700000000000, end: 1700086400000 };

const blobOf = (text) => new Blob([text], { type: 'text/csv' });

beforeEach(() => {
  vi.clearAllMocks();
  axios.post.mockResolvedValue({ status: 200, data: blobOf(populatedCsv) });
});

describe('buildStatsExportFilename', () => {
  it('names the file with the subdomain and the range formatted in the show timezone', () => {
    expect(buildStatsExportFilename('holtz', RANGE, 'America/New_York')).toBe(
      'Remote Falcon Stats holtz 2023-11-14-2023-11-15.csv'
    );
  });

  it('formats in the show timezone, not UTC', () => {
    expect(buildStatsExportFilename('holtz', RANGE, 'UTC')).toBe('Remote Falcon Stats holtz 2023-11-14-2023-11-15.csv');
    expect(buildStatsExportFilename('holtz', RANGE, 'Pacific/Auckland')).toBe(
      'Remote Falcon Stats holtz 2023-11-15-2023-11-16.csv'
    );
  });

  it('strips filesystem-unsafe characters out of the subdomain', () => {
    expect(buildStatsExportFilename('my/show:name*?', RANGE, 'UTC')).toBe(
      'Remote Falcon Stats myshowname 2023-11-14-2023-11-15.csv'
    );
  });

  it('falls back to a generic name when there is no subdomain', () => {
    expect(buildStatsExportFilename(null, RANGE, 'UTC')).toBe('Remote Falcon Stats 2023-11-14-2023-11-15.csv');
  });

  it('tolerates a missing range without producing "Invalid date" in the name', () => {
    expect(buildStatsExportFilename('holtz', null, 'UTC')).toBe('Remote Falcon Stats holtz.csv');
  });
});

describe('countCsvDataRows', () => {
  it('returns 0 for a section-headers-only export (empty date range)', () => {
    expect(countCsvDataRows(emptyCsv)).toBe(0);
  });

  it('counts only data rows, never section titles or column headers', () => {
    expect(countCsvDataRows(populatedCsv)).toBe(1);
  });

  it('returns 0 for empty or nullish input', () => {
    expect(countCsvDataRows('')).toBe(0);
    expect(countCsvDataRows(null)).toBe(0);
  });
});

describe('downloadStatsExport', () => {
  const args = { showSubdomain: 'holtz', timezone: 'America/New_York', range: RANGE };

  it('POSTs the selected range as epoch millis and requests a blob', async () => {
    const dispatch = vi.fn();
    const setLoading = vi.fn();
    await downloadStatsExport(dispatch, args, setLoading);
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/downloadStatsToExcel`,
      { timezone: 'America/New_York', dateFilterStart: RANGE.start, dateFilterEnd: RANGE.end },
      { responseType: 'blob' }
    );
    expect(setLoading).toHaveBeenNthCalledWith(1, true);
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it('downloads under a range-scoped filename so two ranges do not overwrite each other', async () => {
    await downloadStatsExport(vi.fn(), args, vi.fn());
    expect(fileDownload).toHaveBeenCalledTimes(1);
    expect(fileDownload.mock.calls[0][1]).toBe('Remote Falcon Stats holtz 2023-11-14-2023-11-15.csv');
  });

  it('toasts success when the export contains data', async () => {
    const dispatch = vi.fn();
    await downloadStatsExport(dispatch, args, vi.fn());
    expect(showAlert).toHaveBeenCalledWith(dispatch, { message: 'Stats exported' });
  });

  it('still downloads an empty range but says so instead of claiming success', async () => {
    axios.post.mockResolvedValueOnce({ status: 200, data: blobOf(emptyCsv) });
    const dispatch = vi.fn();
    await downloadStatsExport(dispatch, args, vi.fn());
    expect(fileDownload).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(dispatch, {
      message: 'No stats in the selected date range — the exported file has headers only',
      alert: 'warning'
    });
  });

  it('surfaces an error toast on a non-200 response and clears the loading flag', async () => {
    axios.post.mockResolvedValueOnce({ status: 500 });
    const dispatch = vi.fn();
    const setLoading = vi.fn();
    await downloadStatsExport(dispatch, args, setLoading);
    expect(fileDownload).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith(dispatch, { alert: 'error' });
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it('surfaces an error toast when the request rejects and still clears the loading flag', async () => {
    axios.post.mockRejectedValueOnce(new Error('network down'));
    const dispatch = vi.fn();
    const setLoading = vi.fn();
    await downloadStatsExport(dispatch, args, setLoading);
    expect(fileDownload).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith(dispatch, { alert: 'error' });
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it('downloads and reports success when the blob text cannot be read', async () => {
    // Older browsers / polyfilled blobs have no .text(); an unreadable body
    // must not be reported as "no data" — that would be a lie.
    axios.post.mockResolvedValueOnce({ status: 200, data: { size: 42 } });
    const dispatch = vi.fn();
    await downloadStatsExport(dispatch, args, vi.fn());
    expect(fileDownload).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(dispatch, { message: 'Stats exported' });
  });
});
