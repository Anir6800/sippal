import type { Alarm, CalEvent } from './types'
import { addDays, atTime, dayStart, HOUR, inWindow, MIN, nextAt } from './time'

// ---------- Alarms ----------

export function alarmRunsOn(a: Pick<Alarm, 'repeat' | 'days'>, weekday: number): boolean {
  switch (a.repeat) {
    case 'once':
    case 'daily':
      return true
    case 'weekdays':
      return weekday >= 1 && weekday <= 5
    case 'weekends':
      return weekday === 0 || weekday === 6
    case 'custom':
      return a.days.includes(weekday)
  }
}

/** Next fire strictly after `after`, or null if the alarm can never fire. */
export function nextAlarmFire(a: Pick<Alarm, 'repeat' | 'days' | 'time_hhmm' | 'enabled'>, after: Date): Date | null {
  if (!a.enabled) return null
  for (let i = 0; i <= 7; i++) {
    const day = new Date(after.getFullYear(), after.getMonth(), after.getDate() + i)
    const t = atTime(day, a.time_hhmm)
    if (t > after && alarmRunsOn(a, t.getDay())) return t
  }
  return null
}

/** Every fire time in (from, to]. Used for missed-reminder summaries. */
export function alarmFiresBetween(a: Pick<Alarm, 'repeat' | 'days' | 'time_hhmm' | 'enabled'>, from: Date, to: Date): Date[] {
  const out: Date[] = []
  let t = nextAlarmFire(a, from)
  while (t && t <= to) {
    out.push(t)
    if (a.repeat === 'once') break
    t = nextAlarmFire(a, t)
  }
  return out
}

// ---------- Events ----------

type EventLike = Pick<CalEvent, 'start_at' | 'recurrence' | 'remind_before' | 'status'>

/** Occurrence start times with start in [from, to]. Recurrences keep the local wall-clock time. */
export function occurrences(ev: EventLike, from: Date, to: Date): Date[] {
  const base = new Date(ev.start_at)
  if (ev.recurrence === 'none') return base >= from && base <= to ? [base] : []
  const step = ev.recurrence === 'weekly' ? 7 : 1
  // Skip ahead near `from` so old recurring events don't loop through years of history.
  const skipDays = Math.max(0, Math.floor((from.getTime() - base.getTime()) / (24 * HOUR)) - 2)
  let k = Math.floor(skipDays / step)
  const out: Date[] = []
  for (;;) {
    const t = addDays(base, k * step)
    k++
    if (t > to) break
    if (t < from) continue
    if (ev.recurrence === 'weekdays' && (t.getDay() === 0 || t.getDay() === 6)) continue
    out.push(t)
  }
  return out
}

export interface EventFire {
  at: Date
  start: Date
  minutesBefore: number
}

/** Reminder instants in (from, to]: one per remind_before offset plus one at the start. */
export function eventFiresBetween(ev: EventLike, from: Date, to: Date): EventFire[] {
  if (ev.status !== 'active') return []
  const offsets = [...new Set([...ev.remind_before, 0])]
  const maxOff = Math.max(...offsets)
  const fires: EventFire[] = []
  for (const start of occurrences(ev, from, new Date(to.getTime() + maxOff * MIN))) {
    for (const off of offsets) {
      const at = new Date(start.getTime() - off * MIN)
      if (at > from && at <= to) fires.push({ at, start, minutesBefore: off })
    }
  }
  return fires.sort((a, b) => a.at.getTime() - b.at.getTime())
}

export function nextEventFire(ev: EventLike, after: Date): EventFire | null {
  // A recurring event occurs at least weekly, so an 8-day horizon always finds the next one.
  const horizon = ev.recurrence === 'none' ? new Date(8e15) : addDays(after, 8) // 8e15 leaves room below the max Date
  return eventFiresBetween(ev, after, horizon)[0] ?? null
}

// ---------- Water ----------

export interface WaterPlanInput {
  now: Date
  anchor: Date // last log, last reminder, or app start — whichever is latest
  intervalMin: number
  activeStart: string
  activeEnd: string
  dayResetHour: number
  goalReached: boolean
  keepReminding: boolean
  holdUntil: Date | null // snooze / pause
}

export function nextWaterReminder(p: WaterPlanInput): Date {
  let t = new Date(Math.max(p.anchor.getTime() + p.intervalMin * MIN, p.now.getTime() + 1000, p.holdUntil?.getTime() ?? 0))
  if (p.goalReached && !p.keepReminding) {
    // Nothing more today: wait for the next hydration day.
    t = new Date(Math.max(t.getTime(), addDays(dayStart(p.now, p.dayResetHour), 1).getTime()))
  }
  return inWindow(t, p.activeStart, p.activeEnd) ? t : nextAt(t, p.activeStart)
}
