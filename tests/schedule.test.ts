import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { alarmFiresBetween, eventFiresBetween, nextAlarmFire, nextEventFire, nextWaterReminder, occurrences } from '@shared/schedule'
import { toLocalIso } from '@shared/time'
import type { CalEvent } from '@shared/types'

const alarm = (o: Partial<{ repeat: 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom'; days: number[]; time_hhmm: string; enabled: boolean }>) => ({
  repeat: 'daily' as const,
  days: [],
  time_hhmm: '07:00',
  enabled: true,
  ...o
})
const ev = (o: Partial<CalEvent>): CalEvent => ({
  id: 1,
  title: 'x',
  description: null,
  start_at: '2026-09-29T18:00:00+05:30',
  end_at: null,
  remind_before: [10],
  recurrence: 'none',
  status: 'active',
  created_via: 'manual',
  created_at: '',
  updated_at: '',
  ...o
})

// 2026-09-29 is a Tuesday.
const tue1600 = new Date(2026, 8, 29, 16, 0)

describe('alarms', () => {
  it('fires today if still ahead, else tomorrow', () => {
    expect(nextAlarmFire(alarm({ time_hhmm: '18:00' }), tue1600)).toEqual(new Date(2026, 8, 29, 18, 0))
    expect(nextAlarmFire(alarm({ time_hhmm: '07:00' }), tue1600)).toEqual(new Date(2026, 8, 30, 7, 0))
  })

  it('respects weekdays / weekends / custom days', () => {
    const fri2000 = new Date(2026, 9, 2, 20, 0)
    expect(nextAlarmFire(alarm({ repeat: 'weekdays' }), fri2000)).toEqual(new Date(2026, 9, 5, 7, 0)) // Monday
    expect(nextAlarmFire(alarm({ repeat: 'weekends' }), tue1600)).toEqual(new Date(2026, 9, 3, 7, 0)) // Saturday
    expect(nextAlarmFire(alarm({ repeat: 'custom', days: [4] }), tue1600)).toEqual(new Date(2026, 9, 1, 7, 0)) // Thursday
    expect(nextAlarmFire(alarm({ repeat: 'custom', days: [] }), tue1600)).toBeNull()
    expect(nextAlarmFire(alarm({ enabled: false }), tue1600)).toBeNull()
  })

  it('lists missed fires in a window, once-alarms at most once', () => {
    const from = new Date(2026, 8, 28, 0, 0)
    expect(alarmFiresBetween(alarm({}), from, tue1600)).toHaveLength(2) // Mon 07:00, Tue 07:00
    expect(alarmFiresBetween(alarm({ repeat: 'once' }), from, tue1600)).toHaveLength(1)
  })
})

describe('events', () => {
  it('fires at each remind offset and at the start', () => {
    const fires = eventFiresBetween(ev({ remind_before: [30, 10] }), tue1600, new Date(2026, 8, 30))
    expect(fires.map((f) => [f.at.getHours(), f.at.getMinutes(), f.minutesBefore])).toEqual([
      [17, 30, 30],
      [17, 50, 10],
      [18, 0, 0]
    ])
  })

  it('skips past fires and cancelled events', () => {
    expect(nextEventFire(ev({}), new Date(2026, 8, 29, 17, 55))?.minutesBefore).toBe(0)
    expect(nextEventFire(ev({}), new Date(2026, 8, 29, 18, 1))).toBeNull()
    expect(nextEventFire(ev({ status: 'cancelled' }), tue1600)).toBeNull()
  })

  it('expands daily / weekly / weekday recurrences', () => {
    const from = new Date(2026, 8, 29)
    const to = new Date(2026, 9, 12, 23, 59)
    expect(occurrences(ev({ recurrence: 'daily' }), from, to)).toHaveLength(14)
    expect(occurrences(ev({ recurrence: 'weekly' }), from, to)).toHaveLength(2)
    const wk = occurrences(ev({ recurrence: 'weekdays' }), from, to)
    expect(wk).toHaveLength(10)
    expect(wk.every((d) => d.getDay() >= 1 && d.getDay() <= 5)).toBe(true)
  })

  it('finds the next occurrence of an old recurring event quickly', () => {
    const old = ev({ start_at: '2020-01-01T09:00:00+05:30', recurrence: 'daily', remind_before: [] })
    expect(nextEventFire(old, tue1600)?.at).toEqual(new Date(2026, 8, 30, 9, 0))
  })
})

describe('water reminders', () => {
  const base = {
    now: new Date(2026, 8, 29, 12, 0),
    anchor: new Date(2026, 8, 29, 11, 30),
    intervalMin: 45,
    activeStart: '09:00',
    activeEnd: '22:00',
    dayResetHour: 4,
    goalReached: false,
    keepReminding: false,
    holdUntil: null
  }
  it('fires interval after the last log/reminder', () => {
    expect(nextWaterReminder(base)).toEqual(new Date(2026, 8, 29, 12, 15))
  })
  it('respects snooze holds', () => {
    expect(nextWaterReminder({ ...base, holdUntil: new Date(2026, 8, 29, 13, 0) })).toEqual(new Date(2026, 8, 29, 13, 0))
  })
  it('never fires outside active hours', () => {
    expect(nextWaterReminder({ ...base, now: new Date(2026, 8, 29, 21, 50), anchor: new Date(2026, 8, 29, 21, 50) })).toEqual(
      new Date(2026, 8, 30, 9, 0)
    )
  })
  it('stops for the day once the goal is reached, unless keep reminding', () => {
    expect(nextWaterReminder({ ...base, goalReached: true })).toEqual(new Date(2026, 8, 30, 9, 0))
    expect(nextWaterReminder({ ...base, goalReached: true, keepReminding: true })).toEqual(new Date(2026, 8, 29, 12, 15))
  })
  it('fires soon, not in the past, when overdue', () => {
    const t = nextWaterReminder({ ...base, anchor: new Date(2026, 8, 29, 8, 0) })
    expect(t.getTime()).toBeGreaterThan(base.now.getTime())
    expect(t.getTime() - base.now.getTime()).toBeLessThan(5000)
  })
})

describe('DST safety (America/New_York)', () => {
  const orig = process.env.TZ
  beforeAll(() => void (process.env.TZ = 'America/New_York'))
  afterAll(() => void (process.env.TZ = orig))

  it('keeps wall-clock time across the spring-forward change', () => {
    // DST starts 2026-03-08 02:00 local.
    const e = ev({ start_at: '2026-03-07T09:00:00-05:00', recurrence: 'daily', remind_before: [] })
    const occ = occurrences(e, new Date('2026-03-07T00:00:00-05:00'), new Date('2026-03-10T00:00:00-04:00'))
    expect(occ.map((d) => d.getHours())).toEqual([9, 9, 9])
    expect(toLocalIso(occ[1])).toBe('2026-03-08T09:00:00-04:00')
  })

  it('alarms keep their local time across the fall-back change', () => {
    const t = nextAlarmFire(alarm({ time_hhmm: '07:00' }), new Date('2026-10-31T20:00:00-04:00'))
    expect(toLocalIso(t!)).toBe('2026-11-01T07:00:00-05:00')
  })
})
