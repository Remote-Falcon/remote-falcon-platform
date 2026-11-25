import moment from 'moment-timezone';

// Turns a DASHBOARD_STATS per-day block (jukeboxByDate / votingByDate /
// page) into [startOfNightMs, total] points, one per show-local night in
// the selected range. The server only returns days that have stats, so
// nights without any are filled with 0: otherwise the line chart would
// draw straight across dark nights and overstate the trend.
export const buildNightlySeries = (days, range, timezone) => {
  if (!range?.start || !range?.end || !timezone) return [];

  const totals = new Map();
  (days || []).forEach((day) => {
    if (day?.date == null) return;
    const key = moment.tz(day.date, timezone).format('YYYY-MM-DD');
    totals.set(key, (totals.get(key) || 0) + (day.total || 0));
  });

  const end = moment.tz(range.end, timezone);
  const series = [];
  for (let cursor = moment.tz(range.start, timezone).startOf('day'); cursor.isSameOrBefore(end, 'day'); cursor.add(1, 'day')) {
    series.push([cursor.valueOf(), totals.get(cursor.format('YYYY-MM-DD')) || 0]);
  }
  return series;
};
