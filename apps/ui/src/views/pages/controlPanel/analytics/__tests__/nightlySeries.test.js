import { describe, it, expect } from 'vitest';
import moment from 'moment-timezone';

import { buildNightlySeries } from '../nightlySeries';

// Feeds the "Requests per night" line chart on the Overview tab. The
// server returns only days that have stats, so this helper fills the
// gaps with zeros. Without that, ApexCharts draws a straight line across
// dark nights and the chart overstates the trend.

const TZ = 'America/New_York';
const dayMs = (ymd, tz = TZ) => moment.tz(ymd, tz).startOf('day').valueOf();
const range = (start, end, tz = TZ) => ({
  start: moment.tz(start, tz).startOf('day').toISOString(),
  end: moment.tz(end, tz).endOf('day').toISOString()
});

describe('buildNightlySeries', () => {
  it('emits one point per night in range, zero-filling nights with no stats', () => {
    const days = [
      { date: dayMs('2026-12-01'), total: 40 },
      { date: dayMs('2026-12-03'), total: 55 }
    ];
    const series = buildNightlySeries(days, range('2026-12-01', '2026-12-04'), TZ);
    expect(series).toEqual([
      [dayMs('2026-12-01'), 40],
      [dayMs('2026-12-02'), 0],
      [dayMs('2026-12-03'), 55],
      [dayMs('2026-12-04'), 0]
    ]);
  });

  it('buckets a late-evening UTC timestamp onto the show-local night', () => {
    // 2026-12-02T03:30Z is 10:30pm on Dec 1 in New York.
    const days = [{ date: '2026-12-02T03:30:00Z', total: 12 }];
    const series = buildNightlySeries(days, range('2026-12-01', '2026-12-02'), TZ);
    expect(series).toEqual([
      [dayMs('2026-12-01'), 12],
      [dayMs('2026-12-02'), 0]
    ]);
  });

  it('sums duplicate entries that land on the same show-local night', () => {
    const days = [
      { date: dayMs('2026-12-01'), total: 3 },
      { date: dayMs('2026-12-01') + 60_000, total: 4 }
    ];
    expect(buildNightlySeries(days, range('2026-12-01', '2026-12-01'), TZ)).toEqual([[dayMs('2026-12-01'), 7]]);
  });

  it('drops stats outside the selected range', () => {
    const days = [
      { date: dayMs('2026-11-30'), total: 99 },
      { date: dayMs('2026-12-01'), total: 5 }
    ];
    expect(buildNightlySeries(days, range('2026-12-01', '2026-12-01'), TZ)).toEqual([[dayMs('2026-12-01'), 5]]);
  });

  it('treats a missing total as zero', () => {
    const days = [{ date: dayMs('2026-12-01') }];
    expect(buildNightlySeries(days, range('2026-12-01', '2026-12-01'), TZ)).toEqual([[dayMs('2026-12-01'), 0]]);
  });

  it('returns an empty series without a usable range or timezone', () => {
    expect(buildNightlySeries([], null, TZ)).toEqual([]);
    expect(buildNightlySeries([], { start: null, end: null }, TZ)).toEqual([]);
    expect(buildNightlySeries([], range('2026-12-01', '2026-12-02'), undefined)).toEqual([]);
  });

  it('handles undefined days', () => {
    expect(buildNightlySeries(undefined, range('2026-12-01', '2026-12-01'), TZ)).toEqual([[dayMs('2026-12-01'), 0]]);
  });
});
