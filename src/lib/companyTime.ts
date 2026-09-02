// Returns a Date whose local getters (getHours/getDate/etc.) reflect the
// wall-clock time in `timeZone`, regardless of the browser's own timezone —
// company data (schedules, bookings, "today") is meant to be read in the
// company's own configured timezone, not the viewer's.
export const getZonedNow = (timeZone: string): Date => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
}
