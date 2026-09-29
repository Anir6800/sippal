import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb } from '../src/main/db'
import { executeTool, functionDeclarations, runConfirmed, type PendingCall } from '../src/main/ai/tools'
import { runToolLoop, type ModelTurn } from '../src/main/ai/runToolLoop'
import { buildSystemPrompt } from '../src/main/ai/prompt'
import { listEvents } from '../src/main/services/events'
import { listAlarms } from '../src/main/services/alarms'
import { today } from '../src/main/services/water'
import { getSettings } from '../src/main/services/settings'
import { bus } from '../src/main/bus'
import { toLocalIso } from '@shared/time'

const inHours = (h: number): string => toLocalIso(new Date(Date.now() + h * 3600_000))

beforeEach(() => {
  openDb(':memory:')
})

describe('migrations', () => {
  it('creates all tables and records the schema version', () => {
    const db = openDb(':memory:')
    expect(db.pragma('user_version', { simple: true })).toBe(1)
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => (r as { name: string }).name)
    expect(tables).toEqual(expect.arrayContaining(['settings', 'water_logs', 'events', 'alarms', 'chat_history', 'reminder_log']))
  })
})

describe('tool declarations', () => {
  it('produce clean JSON schemas for every tool', () => {
    expect(functionDeclarations).toHaveLength(13)
    const create = functionDeclarations.find((f) => f.name === 'create_event')!
    const schema = create.parametersJsonSchema as { required: string[]; $schema?: string }
    expect(schema.required).toEqual(['title', 'start_iso'])
    expect(schema.$schema).toBeUndefined()
    expect(functionDeclarations.find((f) => f.name === 'list_alarms')!.parametersJsonSchema).toBeUndefined()
  })
})

describe('tool handlers', () => {
  it('create_event validates and creates, broadcasting changes', () => {
    const spy = vi.fn()
    bus.on('msg', spy)
    const r = executeTool('create_event', { title: 'MERN stack meeting', start_iso: inHours(2), remind_before_minutes: [10] }, [])
    bus.off('msg', spy)
    expect(r).toMatchObject({ ok: true, event: { title: 'MERN stack meeting' } })
    expect(listEvents()[0].created_via).toBe('ai')
    expect(spy).toHaveBeenCalledWith({ type: 'changed', domain: 'events' })
  })

  it('rejects bad arguments and past times without touching the DB', () => {
    expect(executeTool('create_event', { title: 'x', start_iso: '2026-09-29T18:00:00' }, [])).toHaveProperty('error')
    expect(executeTool('create_event', { title: 'x', start_iso: inHours(-3) }, [])).toHaveProperty('error')
    expect(executeTool('log_water', { amount_ml: 99999 }, [])).toHaveProperty('error')
    expect(executeTool('rm_rf', {}, [])).toEqual({ error: 'Unknown tool rm_rf' })
    expect(listEvents()).toHaveLength(0)
  })

  it('update_event moves an event; unknown ids are errors', () => {
    executeTool('create_event', { title: 'MERN', start_iso: inHours(2) }, [])
    const id = listEvents()[0].id
    const later = inHours(3)
    expect(executeTool('update_event', { event_id: id, start_iso: later, remind_before_minutes: [30] }, [])).toMatchObject({ ok: true })
    expect(listEvents()[0]).toMatchObject({ start_at: later, remind_before: [30] })
    expect(executeTool('update_event', { event_id: 999, title: 'x' }, [])).toHaveProperty('error')
  })

  it('delete_event only queues a confirmation until confirmed', () => {
    executeTool('create_event', { title: 'MERN', start_iso: inHours(2) }, [])
    const id = listEvents()[0].id
    const pending: PendingCall[] = []
    expect(executeTool('delete_event', { event_id: id }, pending)).toMatchObject({ status: 'pending_confirmation' })
    expect(listEvents()).toHaveLength(1)
    expect(pending[0].summary).toMatch(/^Delete event: MERN/)
    expect(executeTool('delete_event', { event_id: 424242 }, pending)).toHaveProperty('error')
    expect(runConfirmed(pending)[0]).toMatch(/^✅ Deleted event: MERN/)
    expect(listEvents()).toHaveLength(0)
  })

  it('water, goal, interval and alarm tools', () => {
    expect(executeTool('log_water', { amount_ml: 500 }, [])).toMatchObject({ ok: true, total_ml: 500 })
    executeTool('set_water_goal', { amount_ml: 3000 }, [])
    expect(today().goalMl).toBe(3000)
    executeTool('set_water_reminder_interval', { minutes: 30 }, [])
    expect(getSettings().reminderIntervalMin).toBe(30)
    expect(executeTool('create_alarm', { label: 'Wake up', time_hh_mm: '07:00', repeat: 'weekdays' }, [])).toMatchObject({ ok: true })
    expect(listAlarms()[0]).toMatchObject({ repeat: 'weekdays', enabled: true })
    expect(executeTool('create_alarm', { label: 'x', time_hh_mm: '7am', repeat: 'daily' }, [])).toHaveProperty('error')
    expect(executeTool('get_water_stats', {}, [])).toMatchObject({ ok: true, total_ml: 500, goal_ml: 3000 })
  })
})

describe('tool loop', () => {
  it('executes calls, returns function responses, then finishes with text', async () => {
    const turns: ModelTurn[] = [
      { functionCalls: [{ id: 'c1', name: 'log_water', args: { amount_ml: 500 } }] },
      { text: 'Logged 500 ml! 💧' }
    ]
    const seen: unknown[] = []
    const generate = vi.fn(async (contents) => {
      seen.push(structuredClone(contents))
      return turns.shift()!
    })
    const r = await runToolLoop(generate, [{ role: 'user', parts: [{ text: 'I drank a bottle' }] }], (n, a) => executeTool(n, a, []))
    expect(r.text).toBe('Logged 500 ml! 💧')
    expect(generate).toHaveBeenCalledTimes(2)
    const second = seen[1] as { role: string; parts: { functionResponse?: { id: string; response: unknown } }[] }[]
    expect(second.at(-1)!.parts[0].functionResponse).toMatchObject({ id: 'c1', response: { ok: true, total_ml: 500 } })
    expect(today().totalMl).toBe(500)
  })

  it('stops after the max-iteration guard', async () => {
    const generate = vi.fn(async () => ({ functionCalls: [{ name: 'list_alarms', args: {} }] }))
    const r = await runToolLoop(generate, [], (n, a) => executeTool(n, a, []))
    expect(generate).toHaveBeenCalledTimes(6)
    expect(r.text).toMatch(/tangled/)
  })
})

describe('system prompt', () => {
  it('contains current time, offset, name, ids and rules', () => {
    executeTool('create_event', { title: 'MERN stack meeting', start_iso: inHours(2) }, [])
    const p = buildSystemPrompt({
      now: new Date(),
      name: 'Aniruddh',
      events: listEvents(),
      alarms: [],
      water: { totalMl: 750, goalMl: 2500, defaultCupMl: 250, intervalMin: 45 }
    })
    expect(p).toContain('Aniruddh')
    expect(p).toContain('Asia/Kolkata (UTC+05:30)')
    expect(p).toMatch(/#\d+ \| MERN stack meeting/)
    expect(p).toContain('750 / 2500 ml')
    expect(p).toContain('Never invent ids')
  })
})
