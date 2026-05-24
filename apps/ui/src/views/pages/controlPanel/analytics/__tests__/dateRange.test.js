import { describe, it, expect } from 'vitest';
import moment from 'moment-timezone';

import { BUILT_IN_SEASONS, buildPresets, DEFAULT_PRESET_ID } from '../dateRange';

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
