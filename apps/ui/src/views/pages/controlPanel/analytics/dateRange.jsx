// Smart-preset date ranges for the Analytics page. Each preset resolves at
// query time against the show's timezone so "Tonight" and "Last 7 nights"
// always mean what the show owner expects.
//
// Range shape: { start: number, end: number } — millis since epoch in UTC.
// Resolved start/end are the local-midnight boundaries in the show's tz.

import moment from 'moment-timezone';

// Built-in season windows (per the PRD season model). Custom seasons live
// on the show's `preferences.customSeasons` and get merged into the picker.
export const BUILT_IN_SEASONS = [
  { id: 'halloween', label: 'Halloween', startMonthDay: '10-01', endMonthDay: '11-07' },
  { id: 'christmas', label: 'Christmas', startMonthDay: '11-15', endMonthDay: '01-07' }
];

// Helper: take a "MM-DD" string and a year, return a moment in the show's tz
const monthDayToMoment = (monthDay, year, tz) => {
  const [m, d] = monthDay.split('-').map((n) => parseInt(n, 10));
  return moment.tz({ year, month: m - 1, day: d, hour: 0, minute: 0, second: 0 }, tz);
};

// Resolve a season for the current or last occurrence relative to `now`.
// "Christmas" (Nov 15 – Jan 7) wraps the year boundary — handled by checking
// whether we're in the start year or the end year of the window.
const resolveSeason = (season, now, which = 'current') => {
  const y = now.year();
  const startThisYear = monthDayToMoment(season.startMonthDay, y, now.tz());
  let endThisYear = monthDayToMoment(season.endMonthDay, y, now.tz());
  // If end < start, the season wraps the year boundary (Nov 15 – Jan 7).
  if (endThisYear.isBefore(startThisYear)) {
    endThisYear = monthDayToMoment(season.endMonthDay, y + 1, now.tz());
  }
  // Are we currently inside the window?
  const inside = now.isBetween(startThisYear, endThisYear, null, '[]');
  if (which === 'current') {
    if (inside) return { start: startThisYear.valueOf(), end: endThisYear.valueOf() };
    // Not currently inside — "current" defaults to the *upcoming* one
    if (now.isBefore(startThisYear)) {
      return { start: startThisYear.valueOf(), end: endThisYear.valueOf() };
    }
    // We're past this year's window — use next year's
    const nextStart = monthDayToMoment(season.startMonthDay, y + 1, now.tz());
    let nextEnd = monthDayToMoment(season.endMonthDay, y + 1, now.tz());
    if (nextEnd.isBefore(nextStart)) {
      nextEnd = monthDayToMoment(season.endMonthDay, y + 2, now.tz());
    }
    return { start: nextStart.valueOf(), end: nextEnd.valueOf() };
  }
  // 'last' — the most recently completed window
  if (inside || now.isBefore(startThisYear)) {
    const lastStart = monthDayToMoment(season.startMonthDay, y - 1, now.tz());
    let lastEnd = monthDayToMoment(season.endMonthDay, y - 1, now.tz());
    if (lastEnd.isBefore(lastStart)) {
      lastEnd = monthDayToMoment(season.endMonthDay, y, now.tz());
    }
    return { start: lastStart.valueOf(), end: lastEnd.valueOf() };
  }
  return { start: startThisYear.valueOf(), end: endThisYear.valueOf() };
};

// Compute all enabled presets for a given show + current time. Returns
// `[{ id, label, getRange: (now, tz) => { start, end } }, ...]`.
//
// `now` is injected for testability; in production the picker passes
// `moment.tz(undefined, tz)`.
export const buildPresets = ({ timezone = 'UTC', customSeasons = [], yearRoundMode = false } = {}) => {
  const presets = [];

  presets.push({
    id: 'tonight',
    label: 'Tonight',
    getRange: (now) => ({
      start: now.clone().startOf('day').valueOf(),
      end: now.clone().endOf('day').valueOf()
    })
  });

  presets.push({
    id: 'last-7',
    label: 'Last 7 nights',
    getRange: (now) => ({
      start: now.clone().subtract(6, 'days').startOf('day').valueOf(),
      end: now.clone().endOf('day').valueOf()
    })
  });

  presets.push({
    id: 'last-30',
    label: 'Last 30 nights',
    getRange: (now) => ({
      start: now.clone().subtract(29, 'days').startOf('day').valueOf(),
      end: now.clone().endOf('day').valueOf()
    })
  });

  if (yearRoundMode) {
    presets.push({
      id: 'this-year',
      label: 'This year',
      getRange: (now) => ({
        start: now.clone().startOf('year').valueOf(),
        end: now.clone().endOf('day').valueOf()
      })
    });
    presets.push({
      id: 'last-year',
      label: 'Last year',
      getRange: (now) => ({
        start: now.clone().subtract(1, 'year').startOf('year').valueOf(),
        end: now.clone().subtract(1, 'year').endOf('year').valueOf()
      })
    });
  } else {
    BUILT_IN_SEASONS.forEach((season) => {
      presets.push({
        id: `season-${season.id}`,
        label: `This ${season.label}`,
        getRange: (now) => resolveSeason(season, now, 'current')
      });
      presets.push({
        id: `season-${season.id}-last`,
        label: `Last ${season.label}`,
        getRange: (now) => resolveSeason(season, now, 'last')
      });
    });
    customSeasons.forEach((season) => {
      presets.push({
        id: `season-${season.name.toLowerCase().replace(/\s+/g, '-')}`,
        label: `This ${season.name}`,
        getRange: (now) => resolveSeason(season, now, 'current')
      });
    });
  }

  presets.push({
    id: 'season-to-date',
    label: 'Season to date',
    getRange: (now, tz) => {
      // Heuristic: if we're inside Christmas (the dominant season), use it.
      // Otherwise fall back to last-30. Year-round mode gets last-30 as default.
      if (yearRoundMode) {
        return {
          start: now.clone().subtract(29, 'days').startOf('day').valueOf(),
          end: now.clone().endOf('day').valueOf()
        };
      }
      const christmas = BUILT_IN_SEASONS[1];
      const start = monthDayToMoment(christmas.startMonthDay, now.year(), tz);
      let end = monthDayToMoment(christmas.endMonthDay, now.year(), tz);
      if (end.isBefore(start)) end = monthDayToMoment(christmas.endMonthDay, now.year() + 1, tz);
      if (now.isBetween(start, end, null, '[]')) {
        return { start: start.valueOf(), end: now.clone().endOf('day').valueOf() };
      }
      return {
        start: now.clone().subtract(29, 'days').startOf('day').valueOf(),
        end: now.clone().endOf('day').valueOf()
      };
    }
  });

  return presets;
};

export const DEFAULT_PRESET_ID = 'last-7';
