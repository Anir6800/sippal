import { getDb } from '../db'
import { changed, petCue } from '../bus'
import { getSettings } from './settings'
import { addDays, dateKey, dayKeyOf, dayStart } from '@shared/time'
import { effectiveGoal, streak } from '@shared/water'
import type { DayTotal, WaterLog, WaterSource, WaterToday } from '@shared/types'

export function logWater(amount_ml: number, source: WaterSource, at = new Date()): number {
  const id = Number(
    getDb().prepare('INSERT INTO water_logs (amount_ml, logged_at, source) VALUES (?, ?, ?)').run(amount_ml, at.toISOString(), source)
      .lastInsertRowid
  )
  const t = today()
  changed('water')
  petCue({ kind: 'celebrate', totalMl: t.totalMl, goalMl: t.goalMl, goalReached: t.totalMl >= t.goalMl, logId: id })
  return id
}

export function deleteLog(id: number): void {
  getDb().prepare('DELETE FROM water_logs WHERE id = ?').run(id)
  changed('water')
}

export function lastLogAt(): Date | null {
  const row = getDb().prepare('SELECT logged_at FROM water_logs ORDER BY logged_at DESC LIMIT 1').get() as { logged_at: string } | undefined
  return row ? new Date(row.logged_at) : null
}

function logsBetween(from: Date, to: Date): WaterLog[] {
  return getDb()
    .prepare('SELECT * FROM water_logs WHERE logged_at >= ? AND logged_at < ? ORDER BY logged_at DESC')
    .all(from.toISOString(), to.toISOString()) as WaterLog[]
}

/** Totals for the last `days` hydration days, oldest first. */
export function history(days: number, now = new Date()): DayTotal[] {
  const s = getSettings()
  const goal = effectiveGoal(s)
  const todayStart = dayStart(now, s.dayResetHour)
  const totals = new Map<string, number>()
  for (const l of logsBetween(addDays(todayStart, 1 - days), addDays(todayStart, 1))) {
    const k = dayKeyOf(new Date(l.logged_at), s.dayResetHour)
    totals.set(k, (totals.get(k) ?? 0) + l.amount_ml)
  }
  const out: DayTotal[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = dateKey(addDays(todayStart, -i))
    out.push({ day, totalMl: totals.get(day) ?? 0, goalMl: goal })
  }
  return out
}

export function today(now = new Date()): WaterToday {
  const s = getSettings()
  const goal = effectiveGoal(s)
  const start = dayStart(now, s.dayResetHour)
  const logs = logsBetween(start, addDays(start, 1))
  // ponytail: streak is capped at 366 days.
  const hist = history(366, now)
  const totals = new Map(hist.map((d) => [d.day, d.totalMl]))
  return {
    totalMl: logs.reduce((a, l) => a + l.amount_ml, 0),
    goalMl: goal,
    logs,
    dayKey: dateKey(start),
    streak: streak(totals, hist.map((d) => d.day).reverse(), goal)
  }
}
