import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import moment from 'moment-timezone';

const TZ = 'America/New_York';
const day = (ymd) => moment.tz(ymd, TZ).startOf('day').valueOf();

const mocks = vi.hoisted(() => ({
  state: { show: { show: { preferences: { viewerControlMode: 'JUKEBOX' } } } },
  chartProps: null
}));

vi.mock('../../../../../store', () => ({
  useSelector: (fn) => fn(mocks.state)
}));

vi.mock('../useAnalyticsFilters', () => ({
  default: () => ({ timezone: 'America/New_York' })
}));

// ApexCharts needs a real layout engine; capture what the card hands it.
vi.mock('../../dashboard/ApexLineChart', () => ({
  default: (props) => {
    mocks.chartProps = props;
    return <div data-testid="line-chart" />;
  }
}));

import RequestsPerNight from '../RequestsPerNight';

const setMode = (viewerControlMode) => {
  mocks.state = { show: { show: { preferences: { viewerControlMode } } } };
};

describe('RequestsPerNight', () => {
  beforeEach(() => {
    // "Tonight" is Dec 3; the server zero-fills the range past it.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(moment.tz('2026-12-03 20:00', TZ).toDate());
    setMode('JUKEBOX');
    mocks.chartProps = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('charts jukebox requests per night through tonight, not the future zero-fill', () => {
    const stats = {
      loading: false,
      data: {
        jukeboxByDate: [
          { date: day('2026-12-01'), total: 40 },
          { date: day('2026-12-02'), total: 0 },
          { date: day('2026-12-03'), total: 1200 },
          { date: day('2026-12-04'), total: 0 },
          { date: day('2026-12-05'), total: 0 }
        ],
        votingByDate: [{ date: day('2026-12-02'), total: 999 }]
      }
    };
    render(<RequestsPerNight stats={stats} />);

    expect(screen.getByText('Requests per night')).toBeTruthy();
    expect(screen.getByText('1,240 requests across 3 nights')).toBeTruthy();
    expect(mocks.chartProps.timezone).toBe(TZ);
    expect(mocks.chartProps.chartData).toEqual({
      name: 'Requests',
      yValue: 'Requests: ',
      data: [
        [day('2026-12-01'), 40],
        [day('2026-12-02'), 0],
        [day('2026-12-03'), 1200]
      ]
    });
  });

  it('charts votes in voting mode', () => {
    setMode('VOTING');
    const stats = {
      loading: false,
      data: {
        jukeboxByDate: [{ date: day('2026-12-01'), total: 5 }],
        votingByDate: [
          { date: day('2026-12-01'), total: 0 },
          { date: day('2026-12-02'), total: 7 }
        ]
      }
    };
    render(<RequestsPerNight stats={stats} />);

    expect(screen.getByText('Votes per night')).toBeTruthy();
    expect(mocks.chartProps.chartData.name).toBe('Votes');
    expect(mocks.chartProps.chartData.data.map(([, v]) => v)).toEqual([0, 7]);
  });

  it('shows an empty state instead of a flat line when the range has none', () => {
    render(<RequestsPerNight stats={{ loading: false, data: { jukeboxByDate: [{ date: day('2026-12-01'), total: 0 }] } }} />);

    expect(screen.getByText('No requests in this range yet')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });

  it('reports a failed fetch instead of claiming there were no requests', () => {
    render(<RequestsPerNight stats={{ loading: false, data: undefined, error: new Error('timeout') }} />);

    expect(screen.getByText("Couldn't load requests")).toBeTruthy();
    expect(screen.queryByText(/No requests/)).toBeNull();
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });

  it('shows a skeleton while loading', () => {
    render(<RequestsPerNight stats={{ loading: true, data: undefined }} />);

    expect(screen.getByText('Requests per night')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
    expect(screen.queryByText(/No requests/)).toBeNull();
  });
});
