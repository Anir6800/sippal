import { getDb } from '../db'
import { changed } from '../bus'
import { toLocalIso } from '@shared/time'
import { EventInput, EventPatch, type CalEvent } from '@shared/types'

interface Row extends Omit<CalEvent, 'remind_before'> {
  remind_before_json: string
}

const fromRow = ({ remind_before_json, ...r }: Row): CalEvent => ({ ...r, remind_before: JSON.parse(remind_before_json) })
/** Normalise any valid offset ISO to local-offset ISO so stored strings read naturally. */
const norm = (iso: string | null | undefined): string | null => (iso ? toLocalIso(new Date(iso)) : null)

export function listEvents(): CalEvent[] {
  return (getDb().prepare('SELECT * FROM events ORDER BY start_at').all() as Row[]).map(fromRow)
}

export function getEvent(id: number): CalEvent | null {
  const r = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as Row | undefined
  return r ? fromRow(r) : null
}

export function createEvent(input: EventInput, via: 'manual' | 'ai' = 'manual'): CalEvent {
  const e = EventInput.parse(input)
  const now = toLocalIso(new Date())
  const id = getDb()
    .prepare(
      `INSERT INTO events (title, description, start_at, end_at, remind_before_json, recurrence, status, created_via, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    )
    .run(e.title, e.description ?? null, norm(e.start_at), norm(e.end_at), JSON.stringify(e.remind_before), e.recurrence, via, now, now).lastInsertRowid
  changed('events')
  return getEvent(Number(id))!
}

export function updateEvent(id: number, patch: EventPatch): CalEvent {
  const cur = getEvent(id)
  if (!cur) throw new Error(`Event ${id} not found`)
  const p = EventPatch.parse(patch)
  const next = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as CalEvent
  getDb()
    .prepare(
      `UPDATE events SET title=?, description=?, start_at=?, end_at=?, remind_before_json=?, recurrence=?, status=?, updated_at=? WHERE id=?`
    )
    .run(
      next.title,
      next.description ?? null,
      norm(next.start_at),
      norm(next.end_at),
      JSON.stringify(next.remind_before),
      next.recurrence,
      next.status,
      toLocalIso(new Date()),
      id
    )
  changed('events')
  return getEvent(id)!
}

export function deleteEvent(id: number): boolean {
  const n = getDb().prepare('DELETE FROM events WHERE id = ?').run(id).changes
  changed('events')
  return n > 0
}
