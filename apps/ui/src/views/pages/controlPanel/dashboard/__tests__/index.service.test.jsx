import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../../utils/axios', () => ({
  default: { post: vi.fn(() => Promise.resolve({ status: 200, data: new Blob(['csv']) })) }
}));
vi.mock('js-file-download', () => ({ default: vi.fn() }));
vi.mock('../../../globalPageHelpers', () => ({
  showAlert: vi.fn()
}));

import fileDownload from 'js-file-download';
import axios from '../../../../../utils/axios';
import { showAlert } from '../../../globalPageHelpers';

import {
  uniqueViewersByDate,
  totalViewersByDate,
  sequenceRequestsByDate,
  sequenceRequests,
  sequenceVotesByDate,
  sequenceVotes,
  sequenceVoteWinsByDate,
  sequenceVoteWins,
  downloadStatsToExcel,
  validateDatePicker
} from '../index.service';

// Pure data-shaping utils for the dashboard charts. They project a raw
// `dashboardStats` response into the `[x, y]` tuples + tooltip series
// labels Apex consumes. Pin every shape because a regression silently
// renders empty charts.

const sampleStats = {
  page: [
    { date: 1700000000000, unique: 10, total: 20 },
    { date: 1700086400000, unique: 14, total: 30 }
  ],
  jukeboxByDate: [
    {
      date: 1700000000000,
      total: 5,
      sequences: [
        { name: 'Carol of the Bells', total: 3 },
        { name: 'Wizards in Winter', total: 2 }
      ]
    }
  ],
  jukeboxBySequence: {
    sequences: [
      { name: 'Carol of the Bells', total: 12 },
      { name: 'Wizards in Winter', total: 7 }
    ]
  },
  votingByDate: [{ date: 1700000000000, total: 9, sequences: [{ name: 'Carol', total: 9 }] }],
  votingBySequence: { sequences: [{ name: 'Carol', total: 15 }] },
  votingWinByDate: [{ date: 1700000000000, total: 4, sequences: [{ name: 'Carol', total: 4 }] }],
  votingWinBySequence: { sequences: [{ name: 'Carol', total: 8 }] }
};

describe('dashboard index.service — projections', () => {
  it('uniqueViewersByDate emits [date, unique] tuples with the expected yValue label', () => {
    const out = uniqueViewersByDate(sampleStats);
    expect(out.yValue).toBe('Unique Viewers: ');
    expect(out.data).toEqual([[1700000000000, 10], [1700086400000, 14]]);
  });

  it('totalViewersByDate emits [date, total] tuples', () => {
    const out = totalViewersByDate(sampleStats);
    expect(out.yValue).toBe('Total Viewers: ');
    expect(out.data).toEqual([[1700000000000, 20], [1700086400000, 30]]);
  });

  it('sequenceRequestsByDate emits per-bucket data + parallel series labels', () => {
    const out = sequenceRequestsByDate(sampleStats);
    expect(out.yValue).toBe('Total Requests: ');
    expect(out.data).toEqual([[1700000000000, 5]]);
    expect(out.seriesLabels).toHaveLength(1);
    expect(out.seriesLabels[0]).toHaveLength(2);
    expect(out.seriesLabels[0][0]).toMatchObject({ label: 'Carol of the Bells: ' });
  });

  it('sequenceRequests pivots to {x: name, y: total}', () => {
    const out = sequenceRequests(sampleStats);
    expect(out.yValue).toBe('Total Requests: ');
    expect(out.data).toEqual([
      { x: 'Carol of the Bells', y: 12 },
      { x: 'Wizards in Winter', y: 7 }
    ]);
  });

  it('sequenceVotesByDate labels as votes', () => {
    const out = sequenceVotesByDate(sampleStats);
    expect(out.yValue).toBe('Total Votes: ');
    expect(out.data).toEqual([[1700000000000, 9]]);
  });

  it('sequenceVotes returns x/y pivot', () => {
    const out = sequenceVotes(sampleStats);
    expect(out.data).toEqual([{ x: 'Carol', y: 15 }]);
  });

  it('sequenceVoteWinsByDate labels as wins', () => {
    const out = sequenceVoteWinsByDate(sampleStats);
    expect(out.yValue).toBe('Total Wins: ');
    expect(out.data).toEqual([[1700000000000, 4]]);
  });

  it('sequenceVoteWins returns x/y pivot', () => {
    const out = sequenceVoteWins(sampleStats);
    expect(out.data).toEqual([{ x: 'Carol', y: 8 }]);
  });

  it('all projections handle a null/empty stats object without throwing', () => {
    const fns = [
      uniqueViewersByDate,
      totalViewersByDate,
      sequenceRequestsByDate,
      sequenceRequests,
      sequenceVotesByDate,
      sequenceVotes,
      sequenceVoteWinsByDate,
      sequenceVoteWins
    ];
    for (const fn of fns) {
      const out = fn({});
      expect(Array.isArray(out.data)).toBe(true);
      expect(out.data).toEqual([]);
    }
  });
});

describe('downloadStatsToExcel', () => {
  it('POSTs, downloads the CSV, toasts success, and clears the loading flag', async () => {
    const dispatch = vi.fn();
    const setLoading = vi.fn();
    await downloadStatsToExcel(dispatch, 'UTC', 1, 2, setLoading);
    expect(setLoading).toHaveBeenNthCalledWith(1, true);
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/downloadStatsToExcel`,
      { timezone: 'UTC', dateFilterStart: 1, dateFilterEnd: 2 },
      { responseType: 'blob' }
    );
    expect(fileDownload).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(dispatch, { message: 'Dashboard Stats Downloaded' });
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it('surfaces an error toast when the response status is not 200', async () => {
    axios.post.mockResolvedValueOnce({ status: 500 });
    const dispatch = vi.fn();
    const setLoading = vi.fn();
    await downloadStatsToExcel(dispatch, 'UTC', 1, 2, setLoading);
    expect(showAlert).toHaveBeenCalledWith(dispatch, { alert: 'error' });
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });
});

describe('validateDatePicker', () => {
  // NB: DashboardCharts passes the result of `Date.prototype.setHours(...)`
  // which is a *millis* value. The function then uses `moment.unix()` —
  // technically "seconds-since-epoch", but because both sides of the
  // guardrail comparison are passed the same way, the math still works.
  // Tests must therefore use millis, not seconds, to match the real
  // callsite contract.

  it('applies a valid range that is within the 2-years guardrail', () => {
    const dispatch = vi.fn();
    const setStart = vi.fn();
    const setEnd = vi.fn();
    const start = Date.now() - 1000 * 60 * 60 * 24 * 30; // 30 days ago (millis)
    const end = Date.now();
    validateDatePicker(dispatch, start, end, setStart, setEnd);
    expect(setStart).toHaveBeenCalledWith(start);
    expect(setEnd).toHaveBeenCalledWith(end);
  });

  it('rejects an invalid range (start after end) with an Invalid Date Range warning', () => {
    const dispatch = vi.fn();
    const setStart = vi.fn();
    const setEnd = vi.fn();
    const start = Date.now();
    const end = start - 1000 * 60 * 60 * 24;
    validateDatePicker(dispatch, start, end, setStart, setEnd);
    expect(setStart).not.toHaveBeenCalled();
    expect(setEnd).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith(
      dispatch,
      expect.objectContaining({ alert: 'warning', message: 'Invalid Date Range' })
    );
  });
});
