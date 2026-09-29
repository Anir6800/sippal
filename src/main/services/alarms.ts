import { getDb } from '../db'
import { changed } from '../bus'
import { toLocalIso } from '@shared/time'
import { AlarmInput, AlarmPatch, type Alarm } from '@shared/types'

interface Row extends Omit<Alarm, 'days' | 'enabled'> {
  days_json: string
  enabled: number
}

const fromRow = ({ days_json, enabled, ...r }: Row): Alarm => ({ ...r, days: JSON.parse(days_json), enabled: !!enabled })

export function listAlarms(): Alarm[] {
  return (getDb().prepare('SELECT * FROM alarms ORDER BY time_hhmm').all() as Row[]).map(fromRow)
}

export function getAlarm(id: number): Alarm | null {
  const r = getDb().prepare('SELECT * FROM alarms WHERE id = ?').get(id) as Row | undefined
  return r ? fromRow(r) : null
}

export function createAlarm(input: AlarmInput): Alarm {
  const a = AlarmInput.parse(input)
  const id = getDb()
    .prepare('INSERT INTO alarms (label, time_hhmm, repeat, days_json, sound, snooze_min, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(a.label, a.time_hhmm, a.repeat, JSON.stringify(a.days), a.sound, a.snooze_min, a.enabled ? 1 : 0, toLocalIso(new Date()))
    .lastInsertRowid
  changed('alarms')
  return getAlarm(Number(id))!
}

export function updateAlarm(id: number, patch: AlarmPatch): Alarm {
  const cur = getAlarm(id)
  if (!cur) throw new Error(`Alarm ${id} not found`)
  const p = AlarmPatch.parse(patch)
  const n = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as Alarm
  getDb()
    .prepare('UPDATE alarms SET label=?, time_hhmm=?, repeat=?, days_json=?, sound=?, snooze_min=?, enabled=? WHERE id=?')
    .run(n.label, n.time_hhmm, n.repeat, JSON.stringify(n.days), n.sound, n.snooze_min, n.enabled ? 1 : 0, id)
  changed('alarms')
  return getAlarm(id)!
}

export function deleteAlarm(id: number): boolean {
  const n = getDb().prepare('DELETE FROM alarms WHERE id = ?').run(id).changes
  changed('alarms')
  return n > 0
}
