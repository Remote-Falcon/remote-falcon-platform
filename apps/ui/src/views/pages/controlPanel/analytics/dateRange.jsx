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

// --- Custom range -----------------------------------------------------
//
// Stats are swept nightly once they pass this age. Selecting further back
// is allowed — the query simply comes back empty — so this drives a notice
// in the picker, never a block.
export const RETENTION_MONTHS = 18;

// Read the calendar day a picker value *displays* — year/month/day as the
// operator saw them. The MUI DatePicker hands back a browser-local Date, so
// converting the instant into the show's tz would slide the day by one for
// any operator whose own zone sits ahead of the show's. We keep the day and
// re-anchor it below instead.
const pickerDayParts = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const m = moment.isMoment(value) ? value : moment(value);
  if (!m.isValid()) return null;
  return { year: m.year(), month: m.month(), day: m.date() };
};

const showDayBoundary = (value, timezone, edge) => {
  const parts = pickerDayParts(value);
  if (!parts) return null;
  return moment.tz({ year: parts.year, month: parts.month, day: parts.day }, timezone)[edge]('day').valueOf();
};

// Local-midnight boundaries in the SHOW's timezone for the day a picker
// value names. Never use `new Date().setHours(...)` for this — that is the
// operator's browser clock, which is the wrong zone the moment they travel
// or run a show outside their own.
export const startOfShowDay = (value, timezone = 'UTC') => showDayBoundary(value, timezone, 'startOf');
export const endOfShowDay = (value, timezone = 'UTC') => showDayBoundary(value, timezone, 'endOf');

// Inverse of startOfShowDay: given a resolved boundary, produce the Date the
// picker should display so the field shows the show-tz day that is actually
// being queried.
export const showDayToPickerDate = (millis, timezone = 'UTC') => {
  if (!Number.isFinite(millis)) return null;
  const m = moment.tz(millis, timezone);
  if (!m.isValid()) return null;
  return new Date(m.year(), m.month(), m.date());
};

// Validate + resolve a custom range picked in the UI.
//
// Written fresh rather than reviving the dashboard's old `validateDatePicker`
// (deleted alongside DashboardCharts): that helper fed millisecond values into
// `moment.unix()` (which expects seconds), double-subtracted its own lower
// bound so the warning text and the comparison disagreed, and rejected a
// backwards pair outright. Here:
//   - both ends must be real dates
//   - a backwards pair is swapped, not rejected — picking the later day
//     first is a click order, not an error
//   - there is no lower bound; past the retention horizon is flagged so the
//     UI can explain the empty result, but it stays selectable
//
// `now` is injected for testability, same convention as buildPresets.
export const validateCustomRange = (startValue, endValue, timezone = 'UTC', now = null) => {
  const a = startOfShowDay(startValue, timezone);
  const b = startOfShowDay(endValue, timezone);
  if (a === null || b === null) {
    return { valid: false, error: 'Pick a start and an end date.', range: null, swapped: false, beyondRetention: false };
  }

  const swapped = b < a;
  const first = swapped ? endValue : startValue;
  const last = swapped ? startValue : endValue;
  const range = { start: startOfShowDay(first, timezone), end: endOfShowDay(last, timezone) };

  const reference = now || moment.tz(undefined, timezone);
  const horizon = reference.clone().subtract(RETENTION_MONTHS, 'months').startOf('day').valueOf();

  return { valid: true, error: null, range, swapped, beyondRetention: range.start < horizon };
};
