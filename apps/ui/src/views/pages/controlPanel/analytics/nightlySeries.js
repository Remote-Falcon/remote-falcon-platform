import moment from 'moment-timezone';

// Turns a DASHBOARD_STATS per-day block (jukeboxByDate / votingByDate /
// page) into [startOfNightMs, total] chart points. The server already
// zero-fills every day of the requested range, including days that have
// not happened yet: a "This Christmas" range picked on Nov 25 runs to
// Jan 7. Those future zeros would read as demand collapsing, so the
// series stops at tonight in the show's timezone.
export const buildNightlySeries = (days, timezone, now = Date.now()) => {
  if (!timezone) return [];
  const endOfTonight = moment.tz(now, timezone).endOf('day').valueOf();
  return (days || [])
    .filter((day) => day?.date != null && Number(day.date) <= endOfTonight)
    .map((day) => [Number(day.date), day.total || 0]);
};
