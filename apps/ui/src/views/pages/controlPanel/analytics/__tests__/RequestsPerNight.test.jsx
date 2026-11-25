import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import moment from 'moment-timezone';

const TZ = 'America/New_York';
const day = (ymd) => moment.tz(ymd, TZ).startOf('day').valueOf();

const mocks = vi.hoisted(() => ({
  state: { show: { show: { preferences: { viewerControlMode: 'JUKEBOX' } } } },
  stats: { data: undefined, loading: false },
  chartProps: null
}));

vi.mock('../../../../../store', () => ({
  useSelector: (fn) => fn(mocks.state)
}));

vi.mock('../useAnalyticsFilters', () => ({
  default: () => ({
    range: {
      start: moment.tz('2026-12-01', 'America/New_York').startOf('day').toISOString(),
      end: moment.tz('2026-12-03', 'America/New_York').endOf('day').toISOString()
    },
    timezone: 'America/New_York'
  })
}));

vi.mock('../useDashboardStats', () => ({ default: () => mocks.stats }));

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
    setMode('JUKEBOX');
    mocks.stats = { data: undefined, loading: false };
    mocks.chartProps = null;
  });

  it('charts jukebox requests per night, zero-filling dark nights', () => {
    mocks.stats = {
      loading: false,
      data: {
        jukeboxByDate: [
          { date: day('2026-12-01'), total: 40 },
          { date: day('2026-12-03'), total: 1200 }
        ],
        votingByDate: [{ date: day('2026-12-02'), total: 999 }]
      }
    };
    render(<RequestsPerNight />);

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
    mocks.stats = {
      loading: false,
      data: { jukeboxByDate: [{ date: day('2026-12-01'), total: 5 }], votingByDate: [{ date: day('2026-12-02'), total: 7 }] }
    };
    render(<RequestsPerNight />);

    expect(screen.getByText('Votes per night')).toBeTruthy();
    expect(mocks.chartProps.chartData.name).toBe('Votes');
    expect(mocks.chartProps.chartData.data.map(([, v]) => v)).toEqual([0, 7, 0]);
  });

  it('shows an empty state instead of a flat line when the range has none', () => {
    mocks.stats = { loading: false, data: { jukeboxByDate: [] } };
    render(<RequestsPerNight />);

    expect(screen.getByText('No requests in this range yet')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });

  it('shows a skeleton while loading', () => {
    mocks.stats = { loading: true, data: undefined };
    render(<RequestsPerNight />);

    expect(screen.getByText('Requests per night')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
    expect(screen.queryByText(/No requests/)).toBeNull();
  });
});
