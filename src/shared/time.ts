/** Local-time helpers. All wall-clock math uses the system timezone via Date's local getters. */

export const MIN = 60_000
export const HOUR = 60 * MIN

const pad = (n: number): string => String(n).padStart(2, '0')

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Same local calendar day as `d`, at `hhmm`. */
export function atTime(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0)
}

/** Add calendar days keeping the local wall-clock time (DST-safe). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
}

export function offsetString(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
}

/** ISO 8601 in local time with explicit offset, e.g. 2026-09-29T18:00:00+05:30 */
export function toLocalIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offsetString(d)}`
  )
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/** Strict: requires an explicit offset (or Z) so a model can't hand us an ambiguous local time. */
export function parseIsoWithOffset(s: string): Date | null {
  if (!ISO_WITH_OFFSET.test(s)) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Start of the "hydration day" containing `d`; days roll over at `resetHour` local time. */
export function dayStart(d: Date, resetHour: number): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), resetHour)
  return d < s ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, resetHour) : s
}

export function dayKeyOf(d: Date, resetHour: number): string {
  return dateKey(dayStart(d, resetHour))
}

/** Is `d` inside [start, end) local wall-clock window? Handles windows crossing midnight. */
export function inWindow(d: Date, start: string, end: string): boolean {
  const t = d.getHours() * 60 + d.getMinutes()
  const s = hhmmToMinutes(start)
  const e = hhmmToMinutes(end)
  return s <= e ? t >= s && t < e : t >= s || t < e
}

/** First instant strictly after `after` whose local time is `hhmm`. */
export function nextAt(after: Date, hhmm: string): Date {
  const today = atTime(after, hhmm)
  return today > after ? today : atTime(new Date(after.getFullYear(), after.getMonth(), after.getDate() + 1), hhmm)
}

export function timezoneInfo(now = new Date()): { name: string; offset: string } {
  // ICU still reports the legacy alias for India.
  const name = Intl.DateTimeFormat().resolvedOptions().timeZone.replace('Asia/Calcutta', 'Asia/Kolkata')
  return { name, offset: offsetString(now) }
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
