import { describe, expect, it } from 'vitest'
import { dayKeyOf, dayStart, inWindow, nextAt, parseIsoWithOffset, toLocalIso, timezoneInfo } from '@shared/time'
import { goalFromWeight, effectiveGoal, streak } from '@shared/water'
import { mergeSettings, DEFAULT_SETTINGS, SettingsPatch } from '@shared/settings'

// vitest.config sets TZ=Asia/Kolkata (UTC+05:30, no DST).
describe('time utils', () => {
  it('formats local ISO with offset', () => {
    expect(toLocalIso(new Date('2026-09-29T12:30:00Z'))).toBe('2026-09-29T18:00:00+05:30')
    expect(timezoneInfo().offset).toBe('+05:30')
  })

  it('only accepts ISO strings with an explicit offset', () => {
    expect(parseIsoWithOffset('2026-09-29T18:00:00+05:30')?.toISOString()).toBe('2026-09-29T12:30:00.000Z')
    expect(parseIsoWithOffset('2026-09-29T18:00Z')).not.toBeNull()
    expect(parseIsoWithOffset('2026-09-29T18:00:00')).toBeNull() // ambiguous local time
    expect(parseIsoWithOffset('tomorrow at 6')).toBeNull()
    expect(parseIsoWithOffset('2026-13-45T18:00:00+05:30')).toBeNull()
  })

  it('rolls the hydration day over at the reset hour', () => {
    const lateNight = new Date(2026, 8, 30, 2, 0) // 02:00 on the 30th
    expect(dayKeyOf(lateNight, 4)).toBe('2026-09-29')
    expect(dayKeyOf(new Date(2026, 8, 30, 4, 0), 4)).toBe('2026-09-30')
    expect(dayStart(lateNight, 0).getDate()).toBe(30)
  })

  it('handles windows that cross midnight', () => {
    expect(inWindow(new Date(2026, 0, 1, 23, 30), '23:00', '07:00')).toBe(true)
    expect(inWindow(new Date(2026, 0, 1, 6, 59), '23:00', '07:00')).toBe(true)
    expect(inWindow(new Date(2026, 0, 1, 7, 0), '23:00', '07:00')).toBe(false)
    expect(inWindow(new Date(2026, 0, 1, 12, 0), '09:00', '22:00')).toBe(true)
  })

  it('finds the next occurrence of a clock time', () => {
    expect(nextAt(new Date(2026, 8, 29, 16, 5), '18:00')).toEqual(new Date(2026, 8, 29, 18, 0))
    expect(nextAt(new Date(2026, 8, 29, 18, 0), '18:00')).toEqual(new Date(2026, 8, 30, 18, 0))
  })
})

describe('water math', () => {
  it('computes goal from weight (33 ml/kg, rounded to 50)', () => {
    expect(goalFromWeight(70)).toBe(2300) // 2310 → 2300
    expect(goalFromWeight(75)).toBe(2500) // 2475 → 2500
    expect(effectiveGoal({ goalMode: 'weight', weightKg: 60, goalMl: 2500 })).toBe(2000)
    expect(effectiveGoal({ goalMode: 'weight', weightKg: null, goalMl: 2500 })).toBe(2500)
  })

  it('counts streaks from today, or from yesterday while today is in progress', () => {
    const days = ['d0', 'd1', 'd2', 'd3']
    expect(streak(new Map([['d0', 2500], ['d1', 2600], ['d2', 100]]), days, 2500)).toBe(2)
    expect(streak(new Map([['d0', 500], ['d1', 2600], ['d2', 2500]]), days, 2500)).toBe(2)
    expect(streak(new Map([['d0', 500], ['d1', 100]]), days, 2500)).toBe(0)
  })
})

describe('settings', () => {
  it('merges stored values over defaults and drops invalid ones', () => {
    const s = mergeSettings({ goalMl: 3000, petSize: 9999, unknown: 1 })
    expect(s.goalMl).toBe(3000)
    expect(s.petSize).toBe(DEFAULT_SETTINGS.petSize)
    expect('unknown' in s).toBe(false)
  })
  it('patch schema rejects unknown keys and bad values', () => {
    expect(SettingsPatch.safeParse({ goalMl: 3000 }).success).toBe(true)
    expect(SettingsPatch.safeParse({ nope: 1 }).success).toBe(false)
    expect(SettingsPatch.safeParse({ activeStart: '25:00' }).success).toBe(false)
  })
})
