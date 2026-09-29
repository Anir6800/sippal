import schedule from 'node-schedule'
import { bus, petCue } from './bus'
import { notify } from './notify'
import { petAvailable, showDashboard } from './windows'
import { getMeta, getSettings, setMeta, setSettings } from './services/settings'
import { lastLogAt, logWater, today } from './services/water'
import { getAlarm, listAlarms, updateAlarm } from './services/alarms'
import { listEvents } from './services/events'
import { logReminder } from './services/chat'
import { alarmFiresBetween, eventFiresBetween, nextAlarmFire, nextEventFire, nextWaterReminder, type EventFire } from '@shared/schedule'
import { formatTime, HOUR, MIN } from '@shared/time'
import { THIRSTY_LINES } from '@shared/water'
import type { Notification } from 'electron'
import type { CalEvent } from '@shared/types'

/*
 * One node-schedule job per item, always pointing at that item's *next* fire time.
 * Any data change calls replan(), which cancels and recomputes everything — items are few,
 * so this is cheaper to reason about than incremental updates.
 */

const ALARM_MAX_MS = 2 * MIN
const LATE_MS = 2 * MIN
const MISSED_WINDOW = 12 * HOUR

const jobs = new Map<string, schedule.Job>()
const snoozes = new Map<string, schedule.Job>() // alarm snoozes survive replans
const ringing = new Map<number, Notification | null>()
let lastWaterReminder = new Date()
let running = false
let heartbeat: NodeJS.Timeout | null = null
let thirstyLine = 0

function at(key: string, when: Date, fn: () => void, map = jobs): void {
  map.get(key)?.cancel()
  const job = schedule.scheduleJob(when, () => {
    map.delete(key)
    // Timers can fire late after sleep; late reminders become "missed" instead of a burst.
    if (Date.now() - when.getTime() > LATE_MS) missedSummary(new Date(when.getTime() - 1))
    else fn()
  })
  if (job) map.set(key, job)
}

export function replan(): void {
  if (!running) return
  for (const j of jobs.values()) j.cancel()
  jobs.clear()
  const now = new Date()

  for (const a of listAlarms()) {
    const t = nextAlarmFire(a, now)
    if (t) at(`alarm:${a.id}`, t, () => fireAlarm(a.id))
  }
  for (const ev of listEvents()) {
    const f = nextEventFire(ev, now)
    if (f) at(`event:${ev.id}`, f.at, () => fireEvent(ev, f))
  }

  const s = getSettings()
  const t = today(now)
  const holds = [s.snoozedUntil, s.pausedUntil].filter((x): x is string => !!x).map((x) => new Date(x).getTime())
  const water = nextWaterReminder({
    now,
    anchor: new Date(Math.max(lastLogAt()?.getTime() ?? 0, lastWaterReminder.getTime())),
    intervalMin: s.reminderIntervalMin,
    activeStart: s.activeStart,
    activeEnd: s.activeEnd,
    dayResetHour: s.dayResetHour,
    goalReached: t.totalMl >= t.goalMl,
    keepReminding: s.keepReminding,
    holdUntil: holds.length ? new Date(Math.max(...holds)) : null
  })
  at('water', water, fireWater)
}

/** Upcoming job times, for the dashboard/debugging. */
export const plannedJobs = (): { key: string; at: string | undefined }[] =>
  [...jobs].map(([key, j]) => ({ key, at: j.nextInvocation()?.toISOString() }))

// ---------- Firing ----------

function fireWater(): void {
  lastWaterReminder = new Date()
  logReminder('water', null, 'fired')
  const message = THIRSTY_LINES[thirstyLine++ % THIRSTY_LINES.length]
  if (petAvailable()) petCue({ kind: 'thirsty', message })
  else waterNotification(message, true)
  replan()
}

export function waterNotification(body: string, silent: boolean): void {
  const s = getSettings()
  const t = today()
  notify({
    title: `${body}`,
    body: `${t.totalMl} / ${t.goalMl} ml today`,
    silent: silent || !s.notificationSound,
    actions: [`+${s.defaultCupMl} ml`, 'Snooze 10m'],
    onAction: (i) => (i === 0 ? logWater(s.defaultCupMl, 'notification') : snoozeWater(10)),
    onClick: () => showDashboard('today')
  })
}

export function snoozeWater(minutes: number): void {
  logReminder('water', null, 'snoozed')
  setSettings({ snoozedUntil: new Date(Date.now() + minutes * MIN).toISOString() })
}

function fireAlarm(id: number): void {
  const a = getAlarm(id)
  if (!a) return
  logReminder('alarm', a.id, 'fired')
  const s = getSettings()
  const title = `⏰ ${a.label}`
  const subtitle = formatTime(new Date())
  petCue({ kind: 'alert', title, subtitle, alarm: { id: a.id, sound: a.sound }, timeoutMs: ALARM_MAX_MS })
  const n = notify({
    title,
    body: subtitle,
    // The pet window loops the chosen sound; "system" relies on the OS notification sound.
    silent: a.sound !== 'system' || !s.notificationSound,
    actions: ['Dismiss', `Snooze ${a.snooze_min}m`],
    onAction: (i) => respondAlarm(a.id, i === 0 ? 'dismiss' : 'snooze'),
    onClick: () => respondAlarm(a.id, 'dismiss')
  })
  ringing.set(a.id, n)
  setTimeout(() => ringing.has(a.id) && (ringing.delete(a.id), logReminder('alarm', a.id, 'missed')), ALARM_MAX_MS)
  if (a.repeat === 'once') updateAlarm(a.id, { enabled: false })
}

export function respondAlarm(id: number, action: 'dismiss' | 'snooze'): void {
  ringing.get(id)?.close()
  ringing.delete(id)
  petCue({ kind: 'stopAlarm' })
  logReminder('alarm', id, action === 'dismiss' ? 'dismissed' : 'snoozed')
  const a = getAlarm(id)
  if (action === 'snooze' && a) {
    at(String(id), new Date(Date.now() + a.snooze_min * MIN), () => fireAlarm(id), snoozes)
    petCue({ kind: 'say', text: `Okay, snoozing ${a.snooze_min} min 😴` })
  }
}

function fireEvent(ev: CalEvent, f: EventFire): void {
  logReminder('event', ev.id, 'fired')
  const when = formatTime(f.start)
  const subtitle = f.minutesBefore ? `in ${f.minutesBefore} min · ${when}` : `starting now · ${when}`
  petCue({ kind: 'alert', title: `📅 ${ev.title}`, subtitle, timeoutMs: 60_000 })
  notify({ title: `📅 ${ev.title}`, body: subtitle, silent: !getSettings().notificationSound, onClick: () => showDashboard('schedule') })
  replan()
}

// ---------- Missed reminders ----------

/** One "You missed…" summary for everything that should have fired since `since` (max 12h back). */
export function missedSummary(since: Date): void {
  const now = new Date()
  const from = new Date(Math.max(since.getTime(), now.getTime() - MISSED_WINDOW))
  const items: string[] = []
  for (const a of listAlarms()) {
    const fires = alarmFiresBetween(a, from, now)
    if (!fires.length) continue
    items.push(`⏰ ${a.label} (${formatTime(fires[fires.length - 1])})`)
    logReminder('alarm', a.id, 'missed')
    if (a.repeat === 'once') updateAlarm(a.id, { enabled: false })
  }
  for (const ev of listEvents()) {
    const fires = eventFiresBetween(ev, from, now)
    if (!fires.length) continue
    items.push(`📅 ${ev.title} (${formatTime(fires[fires.length - 1].start)})`)
    logReminder('event', ev.id, 'missed')
  }
  if (!items.length) return
  notify({ title: 'You missed…', body: items.join('\n'), onClick: () => showDashboard('schedule') })
  petCue({ kind: 'alert', title: 'While you were away…', subtitle: items.join('\n'), timeoutMs: 60_000 })
}

// ---------- Lifecycle ----------

const beat = (): void => setMeta('lastAlive', new Date().toISOString())

export function start(): void {
  running = true
  const last = getMeta('lastAlive')
  if (last) missedSummary(new Date(last))
  beat()
  heartbeat = setInterval(beat, MIN)
  replan()
}

/** Stop all timers (on suspend/quit) so nothing fires in a burst on wake. */
export function stop(): void {
  beat()
  running = false
  if (heartbeat) clearInterval(heartbeat)
  for (const j of jobs.values()) j.cancel()
  jobs.clear()
}

export function resume(): void {
  stop()
  start()
}

bus.on('msg', (m) => {
  if (m.type === 'changed' && m.domain !== 'chat') replan()
})
