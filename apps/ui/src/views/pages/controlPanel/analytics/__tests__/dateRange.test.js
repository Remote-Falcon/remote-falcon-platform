import { describe, it, expect } from 'vitest';
import moment from 'moment-timezone';

import {
  BUILT_IN_SEASONS,
  buildPresets,
  DEFAULT_PRESET_ID,
  RETENTION_MONTHS,
  endOfShowDay,
  showDayToPickerDate,
  startOfShowDay,
  validateCustomRange
} from '../dateRange';

// The analytics date-range picker drives every aggregate metric on the
// page. The presets here resolve at query time against the show's
// timezone, so "Tonight" really means tonight, and the Halloween /
// Christmas season windows wrap year boundaries correctly. Pin these
// because a regression silently shifts the data the operator sees.

const at = (iso, tz = 'America/New_York') => moment.tz(iso, tz);

describe('BUILT_IN_SEASONS', () => {
  it('exposes Halloween and Christmas with the documented date windows', () => {
    expect(BUILT_IN_SEASONS).toHaveLength(2);
    expect(BUILT_IN_SEASONS[0]).toMatchObject({
      id: 'halloween',
      startMonthDay: '10-01',
      endMonthDay: '11-07'
    });
    expect(BUILT_IN_SEASONS[1]).toMatchObject({
      id: 'christmas',
      startMonthDay: '11-15',
      endMonthDay: '01-07'
    });
  });
});

describe('DEFAULT_PRESET_ID', () => {
  it('defaults the picker to last-7 so the page never opens with no data', () => {
    expect(DEFAULT_PRESET_ID).toBe('last-7');
  });
});

describe('buildPresets — common presets', () => {
  const presets = buildPresets({ timezone: 'America/New_York' });
  const byId = Object.fromEntries(presets.map((p) => [p.id, p]));

  it('always includes Tonight, Last 7, Last 30, and Season to date', () => {
    expect(byId.tonight).toBeDefined();
    expect(byId['last-7']).toBeDefined();
    expect(byId['last-30']).toBeDefined();
    expect(byId['season-to-date']).toBeDefined();
  });

  it('tonight resolves to the show-tz day boundaries', () => {
    const now = at('2026-03-15T18:00:00');
    const range = byId.tonight.getRange(now);
    expect(range.start).toBe(now.clone().startOf('day').valueOf());
    expect(range.end).toBe(now.clone().endOf('day').valueOf());
  });

  it('last-7 spans exactly 7 calendar days inclusive', () => {
    const now = at('2026-03-15T18:00:00');
    const range = byId['last-7'].getRange(now);
    // start = 6 days before today's start-of-day, end = today's end-of-day
    expect(range.start).toBe(now.clone().subtract(6, 'days').startOf('day').valueOf());
    expect(range.end).toBe(now.clone().endOf('day').valueOf());
  });

  it('last-30 spans exactly 30 calendar days inclusive', () => {
    const now = at('2026-03-15T18:00:00');
    const range = byId['last-30'].getRange(now);
    expect(range.start).toBe(now.clone().subtract(29, 'days').startOf('day').valueOf());
    expect(range.end).toBe(now.clone().endOf('day').valueOf());
  });
});

describe('buildPresets — yearRoundMode', () => {
  it('swaps season presets for This/Last year', () => {
    const presets = buildPresets({ timezone: 'America/New_York', yearRoundMode: true });
    const ids = presets.map((p) => p.id);
    expect(ids).toContain('this-year');
    expect(ids).toContain('last-year');
    expect(ids).not.toContain('season-halloween');
    expect(ids).not.toContain('season-christmas');
  });

  it('season-to-date falls back to last-30 when yearRoundMode is on', () => {
    const presets = buildPresets({ timezone: 'America/New_York', yearRoundMode: true });
    const std = presets.find((p) => p.id === 'season-to-date');
    const now = at('2026-06-15T18:00:00');
    const range = std.getRange(now, 'America/New_York');
    expect(range.start).toBe(now.clone().subtract(29, 'days').startOf('day').valueOf());
    expect(range.end).toBe(now.clone().endOf('day').valueOf());
  });
});

describe('buildPresets — built-in seasons (non-yearRoundMode)', () => {
  const presets = buildPresets({ timezone: 'America/New_York' });
  const byId = Object.fromEntries(presets.map((p) => [p.id, p]));

  it('emits This/Last presets for both Halloween and Christmas', () => {
    expect(byId['season-halloween']).toBeDefined();
    expect(byId['season-halloween-last']).toBeDefined();
    expect(byId['season-christmas']).toBeDefined();
    expect(byId['season-christmas-last']).toBeDefined();
  });

  it('"This Halloween" resolves to Oct 1 → Nov 7 when we are inside the window', () => {
    const now = at('2026-10-15T20:00:00');
    const r = byId['season-halloween'].getRange(now);
    expect(moment.tz(r.start, 'America/New_York').format('MM-DD')).toBe('10-01');
    expect(moment.tz(r.end, 'America/New_York').format('MM-DD')).toBe('11-07');
  });

  it('"This Halloween" rolls forward to next year once the window has passed', () => {
    const now = at('2026-12-20T12:00:00');
    const r = byId['season-halloween'].getRange(now);
    expect(moment.tz(r.start, 'America/New_York').year()).toBe(2027);
    expect(moment.tz(r.end, 'America/New_York').year()).toBe(2027);
  });

  it('"This Christmas" wraps Nov 15 → Jan 7 across the year boundary', () => {
    const now = at('2026-11-20T20:00:00');
    const r = byId['season-christmas'].getRange(now);
    expect(moment.tz(r.start, 'America/New_York').format('YYYY-MM-DD')).toBe('2026-11-15');
    expect(moment.tz(r.end, 'America/New_York').format('YYYY-MM-DD')).toBe('2027-01-07');
  });

  it('"Last Christmas" surfaces the most recently completed window', () => {
    const now = at('2026-03-15T12:00:00');
    const r = byId['season-christmas-last'].getRange(now);
    expect(moment.tz(r.start, 'America/New_York').format('YYYY-MM-DD')).toBe('2025-11-15');
    expect(moment.tz(r.end, 'America/New_York').format('YYYY-MM-DD')).toBe('2026-01-07');
  });
});

describe('buildPresets — custom seasons', () => {
  it('appends a `This <name>` preset for each custom season, slug-cased', () => {
    const presets = buildPresets({
      timezone: 'America/New_York',
      customSeasons: [{ name: 'Independence Week', startMonthDay: '07-01', endMonthDay: '07-07' }]
    });
    const ids = presets.map((p) => p.id);
    expect(ids).toContain('season-independence-week');
  });
});

// --- Custom range ------------------------------------------------------
//
// The custom picker hands us whatever the MUI DatePicker produced (a
// browser-local Date). These helpers snap that to the calendar day the
// operator actually saw and resolve it against the SHOW's timezone, so an
// owner in Denver filtering a Nashville show gets Nashville midnights.

describe('startOfShowDay / endOfShowDay', () => {
  it('snaps a browser-local Date to that calendar day in the show tz', () => {
    const tz = 'America/Chicago';
    const picked = new Date(2026, 2, 15); // Mar 15 2026, browser-local midnight
    expect(startOfShowDay(picked, tz)).toBe(moment.tz({ year: 2026, month: 2, day: 15 }, tz).startOf('day').valueOf());
    expect(endOfShowDay(picked, tz)).toBe(moment.tz({ year: 2026, month: 2, day: 15 }, tz).endOf('day').valueOf());
  });

  it('resolves the same calendar day differently per show tz', () => {
    const picked = new Date(2026, 2, 15);
    const chicago = startOfShowDay(picked, 'America/Chicago');
    const auckland = startOfShowDay(picked, 'Pacific/Auckland');
    expect(chicago).not.toBe(auckland);
    expect(moment.tz(chicago, 'America/Chicago').format('YYYY-MM-DD HH:mm')).toBe('2026-03-15 00:00');
    expect(moment.tz(auckland, 'Pacific/Auckland').format('YYYY-MM-DD HH:mm')).toBe('2026-03-15 00:00');
  });

  it('honours a short DST day rather than assuming 24h', () => {
    // Mar 8 2026 is the US spring-forward: the local day is 23h long.
    const tz = 'America/New_York';
    const picked = new Date(2026, 2, 8);
    const span = endOfShowDay(picked, tz) - startOfShowDay(picked, tz);
    expect(span).toBe(23 * 60 * 60 * 1000 - 1);
  });

  it('accepts millis and a moment, not just a Date', () => {
    const tz = 'America/Chicago';
    const expected = moment.tz({ year: 2026, month: 10, day: 2 }, tz).startOf('day').valueOf();
    expect(startOfShowDay(new Date(2026, 10, 2).valueOf(), tz)).toBe(expected);
    expect(startOfShowDay(moment.tz({ year: 2026, month: 10, day: 2 }, tz), tz)).toBe(expected);
  });

  it('returns null for anything that is not a real date', () => {
    expect(startOfShowDay(null, 'America/Chicago')).toBeNull();
    expect(startOfShowDay(undefined, 'America/Chicago')).toBeNull();
    expect(startOfShowDay('', 'America/Chicago')).toBeNull();
    expect(startOfShowDay('abc', 'America/Chicago')).toBeNull();
    expect(startOfShowDay(new Date('nope'), 'America/Chicago')).toBeNull();
    expect(endOfShowDay(NaN, 'America/Chicago')).toBeNull();
  });
});

describe('showDayToPickerDate', () => {
  it('round-trips a resolved boundary back to the day the operator picked', () => {
    const tz = 'Pacific/Auckland';
    const start = startOfShowDay(new Date(2026, 2, 15), tz);
    const back = showDayToPickerDate(start, tz);
    expect(back).toBeInstanceOf(Date);
    expect(startOfShowDay(back, tz)).toBe(start);
  });

  it('returns null when there is no boundary to show', () => {
    expect(showDayToPickerDate(null, 'UTC')).toBeNull();
    expect(showDayToPickerDate(NaN, 'UTC')).toBeNull();
  });
});

describe('validateCustomRange', () => {
  const tz = 'America/Chicago';
  const now = at('2026-03-20T12:00:00', tz);

  it('resolves a well-ordered pair to show-tz day boundaries', () => {
    const res = validateCustomRange(new Date(2026, 2, 1), new Date(2026, 2, 15), tz, now);
    expect(res.valid).toBe(true);
    expect(res.swapped).toBe(false);
    expect(res.range.start).toBe(moment.tz({ year: 2026, month: 2, day: 1 }, tz).startOf('day').valueOf());
    expect(res.range.end).toBe(moment.tz({ year: 2026, month: 2, day: 15 }, tz).endOf('day').valueOf());
  });

  it('swaps a backwards pair instead of rejecting it', () => {
    const res = validateCustomRange(new Date(2026, 2, 15), new Date(2026, 2, 1), tz, now);
    expect(res.valid).toBe(true);
    expect(res.swapped).toBe(true);
    expect(res.range.start).toBe(moment.tz({ year: 2026, month: 2, day: 1 }, tz).startOf('day').valueOf());
    expect(res.range.end).toBe(moment.tz({ year: 2026, month: 2, day: 15 }, tz).endOf('day').valueOf());
  });

  it('treats a single day as a valid whole-day range', () => {
    const res = validateCustomRange(new Date(2026, 2, 15), new Date(2026, 2, 15), tz, now);
    expect(res.valid).toBe(true);
    expect(res.range.end).toBeGreaterThan(res.range.start);
  });

  it('rejects a missing or unparseable end of the range', () => {
    expect(validateCustomRange(new Date(2026, 2, 1), null, tz, now).valid).toBe(false);
    expect(validateCustomRange(null, new Date(2026, 2, 1), tz, now).valid).toBe(false);
    expect(validateCustomRange(new Date('nope'), new Date(2026, 2, 1), tz, now).valid).toBe(false);
    expect(validateCustomRange(new Date(2026, 2, 1), new Date('nope'), tz, now).error).toBeTruthy();
  });

  it('allows dates past the retention horizon but flags them as empty-by-design', () => {
    // The nightly sweep deletes stats older than 18 months. Selecting
    // further back is legal — it just returns nothing — so this is a
    // notice, never a block.
    const res = validateCustomRange(new Date(2023, 0, 1), new Date(2023, 0, 31), tz, now);
    expect(res.valid).toBe(true);
    expect(res.beyondRetention).toBe(true);
    expect(RETENTION_MONTHS).toBe(18);
  });

  it('does not flag a range inside the retention horizon', () => {
    const res = validateCustomRange(new Date(2026, 1, 1), new Date(2026, 2, 1), tz, now);
    expect(res.beyondRetention).toBe(false);
  });
});
