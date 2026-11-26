import { describe, it, expect } from 'vitest';
import moment from 'moment-timezone';

import { buildNightlySeries } from '../nightlySeries';

// Feeds the "Requests per night" line chart on the Overview tab. The
// server zero-fills the whole requested range, future days included, so
// the helper's job is to stop the line at tonight: otherwise a season
// range picked mid-season ends in a run of zeros that reads as demand
// collapsing.

const TZ = 'America/New_York';
const dayMs = (ymd, tz = TZ) => moment.tz(ymd, tz).startOf('day').valueOf();
// 9pm Dec 2 in New York (02:00Z Dec 3): still "tonight" = Dec 2.
const NOW = moment.tz('2026-12-02 21:00', TZ).valueOf();

describe('buildNightlySeries', () => {
  it('maps server rows to [date, total] points, keeping zero nights', () => {
    const days = [
      { date: dayMs('2026-12-01'), total: 40 },
      { date: dayMs('2026-12-02'), total: 0 }
    ];
    expect(buildNightlySeries(days, TZ, NOW)).toEqual([
      [dayMs('2026-12-01'), 40],
      [dayMs('2026-12-02'), 0]
    ]);
  });

  it('drops nights after tonight in the show timezone', () => {
    const days = [
      { date: dayMs('2026-12-01'), total: 40 },
      { date: dayMs('2026-12-02'), total: 55 },
      { date: dayMs('2026-12-03'), total: 0 },
      { date: dayMs('2026-12-04'), total: 0 }
    ];
    expect(buildNightlySeries(days, TZ, NOW)).toEqual([
      [dayMs('2026-12-01'), 40],
      [dayMs('2026-12-02'), 55]
    ]);
  });

  it('uses the show timezone, not UTC, to decide what tonight is', () => {
    // At NOW it is already Dec 3 in UTC, but Dec 3 has not started in New York.
    const days = [{ date: dayMs('2026-12-03'), total: 0 }];
    expect(buildNightlySeries(days, TZ, NOW)).toEqual([]);
    expect(buildNightlySeries([{ date: dayMs('2026-12-03', 'UTC'), total: 1 }], 'UTC', NOW)).toEqual([
      [dayMs('2026-12-03', 'UTC'), 1]
    ]);
  });

  it('accepts Long dates serialized as strings', () => {
    expect(buildNightlySeries([{ date: String(dayMs('2026-12-01')), total: 3 }], TZ, NOW)).toEqual([[dayMs('2026-12-01'), 3]]);
  });

  it('treats a missing total as zero and skips rows without a date', () => {
    const days = [{ date: dayMs('2026-12-01') }, { total: 9 }, null];
    expect(buildNightlySeries(days, TZ, NOW)).toEqual([[dayMs('2026-12-01'), 0]]);
  });

  it('returns an empty series without days or a timezone', () => {
    expect(buildNightlySeries(undefined, TZ, NOW)).toEqual([]);
    expect(buildNightlySeries([{ date: dayMs('2026-12-01'), total: 1 }], undefined, NOW)).toEqual([]);
  });
});
