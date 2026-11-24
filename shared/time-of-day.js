// Clock times as the site stores them: "HH:MM", 24-hour, Norwegian local
// time. Events, yearly-calendar entries and the event form all read them
// through here, so the browser and the API accept and order the same values.
const TIME_OF_DAY_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "9:30" becomes "09:30", so string comparison orders times; anything else is null. */
export function normalizeTimeOfDay(value) {
  if (typeof value !== 'string') return null;
  const match = TIME_OF_DAY_RE.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

export function isTimeOfDay(value) {
  return normalizeTimeOfDay(value) !== null;
}

/** Whether both are clock times and `end` comes later the same day. */
export function endsAfterStart(start, end) {
  const from = normalizeTimeOfDay(start);
  const to = normalizeTimeOfDay(end);
  return from !== null && to !== null && to > from;
}
