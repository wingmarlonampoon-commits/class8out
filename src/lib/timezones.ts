export type TimezoneOption = { value: string; label: string }

// Curated fallback for the rare browser without Intl.supportedValuesOf('timeZone').
const FALLBACK_ZONES = [
  'UTC',
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
]

function getOffsetMinutes(timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(
      new Date(),
    )
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
    const match = raw.match(/GMT([+-])(\d{2}):(\d{2})/)
    if (!match) return 0
    const sign = match[1] === '-' ? -1 : 1
    return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10))
  } catch {
    return 0
  }
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `GMT${sign}${hh}:${mm}`
}

function formatLabel(timeZone: string, offsetMinutes: number): string {
  const readable = timeZone.replace(/_/g, ' ').replace(/\//g, ' – ')
  return `(${formatOffset(offsetMinutes)}) ${readable}`
}

// Every IANA time zone the browser knows about, formatted with a live UTC
// offset and sorted west-to-east so the picker reads like a normal world map.
export function getAllTimezones(): TimezoneOption[] {
  let zones: string[]
  try {
    zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_ZONES
  } catch {
    zones = FALLBACK_ZONES
  }

  return zones
    .map((tz) => {
      const offsetMinutes = getOffsetMinutes(tz)
      return { value: tz, label: formatLabel(tz, offsetMinutes), offsetMinutes }
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label))
    .map(({ value, label }) => ({ value, label }))
}
