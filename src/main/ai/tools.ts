import { z } from 'zod'
import type { FunctionDeclaration } from '@google/genai'
import { bus, petCue } from '../bus'
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from '../services/events'
import { createAlarm, deleteAlarm, getAlarm, listAlarms, updateAlarm } from '../services/alarms'
import { history, logWater, today } from '../services/water'
import { getSettings, setSettings } from '../services/settings'
import { isoWithOffset, RECURRENCES, REPEATS, SOUNDS, type CalEvent } from '@shared/types'
import { occurrences } from '@shared/schedule'
import { formatTime, MIN, parseIsoWithOffset, toLocalIso } from '@shared/time'

/*
 * Each tool's zod schema is the single source of truth: it produces the JSON schema sent to
 * Gemini AND validates the arguments Gemini sends back before anything touches the DB.
 * Tools with `confirm` are destructive: they only queue a pending action for the UI's confirm card.
 */

interface Tool<S extends z.ZodObject> {
  description: string
  args: S
  run: (a: z.infer<S>) => unknown
  /** Returns the human summary for the confirm card, or null if the target doesn't exist. */
  confirm?: (a: z.infer<S>) => string | null
}
const tool = <S extends z.ZodObject>(t: Tool<S>): Tool<S> => t

const id = (what: string) => z.number().int().positive().describe(`The ${what} id from the context or a list tool`)
const minutesList = z.array(z.number().int().min(0).max(10080)).max(5).describe('Minutes before start to remind, e.g. [10] or [30, 0]')
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('24h local time HH:MM')
const days = z.array(z.number().int().min(0).max(6)).describe('Days of week for custom repeat, 0=Sunday … 6=Saturday')

const compactEvent = (e: CalEvent) => ({
  id: e.id,
  title: e.title,
  start: e.start_at,
  end: e.end_at,
  remind_before_minutes: e.remind_before,
  recurrence: e.recurrence,
  status: e.status
})
const describeEvent = (e: CalEvent): string => `${e.title} (${new Date(e.start_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })})`

export const TOOLS = {
  create_event: tool({
    description: 'Create a calendar event, meeting or task with a start time. Reminders fire before and at the start.',
    args: z.object({
      title: z.string().min(1).max(120),
      start_iso: isoWithOffset.describe('Absolute start, ISO 8601 with offset'),
      end_iso: isoWithOffset.optional().describe('Absolute end, ISO 8601 with offset'),
      remind_before_minutes: minutesList.optional(),
      recurrence: z.enum(RECURRENCES).optional(),
      description: z.string().max(1000).optional()
    }),
    run: (a) => {
      const start = parseIsoWithOffset(a.start_iso)!
      if ((a.recurrence ?? 'none') === 'none' && start.getTime() < Date.now() - MIN)
        return { error: `start_iso ${a.start_iso} is in the past (now is ${toLocalIso(new Date())}). Use the next future occurrence.` }
      const e = createEvent(
        { title: a.title, start_at: a.start_iso, end_at: a.end_iso, remind_before: a.remind_before_minutes, recurrence: a.recurrence, description: a.description },
        'ai'
      )
      petCue({ kind: 'say', text: `Got it! ${e.title} at ${formatTime(new Date(e.start_at))} ✅` })
      return { ok: true, event: compactEvent(e) }
    }
  }),
  list_events: tool({
    description: 'List event occurrences (including recurring ones) starting within a time range.',
    args: z.object({ from_iso: isoWithOffset, to_iso: isoWithOffset }),
    run: (a) => {
      const from = new Date(a.from_iso)
      const to = new Date(a.to_iso)
      const items = listEvents()
        .filter((e) => e.status === 'active')
        .flatMap((e) => occurrences(e, from, to).map((s) => ({ ...compactEvent(e), start: toLocalIso(s) })))
        .sort((x, y) => x.start.localeCompare(y.start))
      return { ok: true, events: items }
    }
  }),
  update_event: tool({
    description: 'Change fields of an existing event (move it, rename it, change reminders, mark completed/cancelled).',
    args: z.object({
      event_id: id('event'),
      title: z.string().min(1).max(120).optional(),
      start_iso: isoWithOffset.optional(),
      end_iso: isoWithOffset.optional(),
      remind_before_minutes: minutesList.optional(),
      recurrence: z.enum(RECURRENCES).optional(),
      description: z.string().max(1000).optional(),
      status: z.enum(['active', 'completed']).optional()
    }),
    run: (a) => {
      if (!getEvent(a.event_id)) return { error: `No event with id ${a.event_id}. Call list_events.` }
      const e = updateEvent(a.event_id, {
        title: a.title,
        start_at: a.start_iso,
        end_at: a.end_iso,
        remind_before: a.remind_before_minutes,
        recurrence: a.recurrence,
        description: a.description,
        status: a.status
      })
      petCue({ kind: 'say', text: `Updated: ${e.title} at ${formatTime(new Date(e.start_at))} ✏️` })
      return { ok: true, event: compactEvent(e) }
    }
  }),
  delete_event: tool({
    description: 'Delete (cancel) an event. Requires the user to press Confirm in the UI.',
    args: z.object({ event_id: id('event') }),
    confirm: (a) => {
      const e = getEvent(a.event_id)
      return e ? `Delete event: ${describeEvent(e)}` : null
    },
    run: (a) => ({ ok: deleteEvent(a.event_id) })
  }),
  create_alarm: tool({
    description: 'Create an alarm that rings with a sound at a local time.',
    args: z.object({
      label: z.string().min(1).max(80),
      time_hh_mm: hhmm,
      repeat: z.enum(REPEATS).describe('once, daily, weekdays (Mon-Fri), weekends, or custom days'),
      days_of_week: days.optional(),
      sound: z.enum(SOUNDS).optional()
    }),
    run: (a) => {
      if (a.repeat === 'custom' && !a.days_of_week?.length) return { error: 'custom repeat needs days_of_week' }
      const al = createAlarm({ label: a.label, time_hhmm: a.time_hh_mm, repeat: a.repeat, days: a.days_of_week ?? [], sound: a.sound })
      petCue({ kind: 'say', text: `Alarm set: ${al.label} at ${al.time_hhmm} (${al.repeat}) ⏰` })
      return { ok: true, alarm: al }
    }
  }),
  list_alarms: tool({
    description: 'List all alarms.',
    args: z.object({}),
    run: () => ({ ok: true, alarms: listAlarms() })
  }),
  update_alarm: tool({
    description: 'Change an existing alarm (time, label, repeat, days, sound, enable/disable).',
    args: z.object({
      alarm_id: id('alarm'),
      label: z.string().min(1).max(80).optional(),
      time_hh_mm: hhmm.optional(),
      repeat: z.enum(REPEATS).optional(),
      days_of_week: days.optional(),
      sound: z.enum(SOUNDS).optional(),
      snooze_min: z.number().int().min(1).max(60).optional(),
      enabled: z.boolean().optional()
    }),
    run: (a) => {
      if (!getAlarm(a.alarm_id)) return { error: `No alarm with id ${a.alarm_id}. Call list_alarms.` }
      return {
        ok: true,
        alarm: updateAlarm(a.alarm_id, {
          label: a.label,
          time_hhmm: a.time_hh_mm,
          repeat: a.repeat,
          days: a.days_of_week,
          sound: a.sound,
          snooze_min: a.snooze_min,
          enabled: a.enabled
        })
      }
    }
  }),
  delete_alarm: tool({
    description: 'Delete an alarm. Requires the user to press Confirm in the UI.',
    args: z.object({ alarm_id: id('alarm') }),
    confirm: (a) => {
      const al = getAlarm(a.alarm_id)
      return al ? `Delete alarm: ${al.label} (${al.time_hhmm}, ${al.repeat})` : null
    },
    run: (a) => ({ ok: deleteAlarm(a.alarm_id) })
  }),
  log_water: tool({
    description: 'Log water the user drank.',
    args: z.object({ amount_ml: z.number().int().min(10).max(3000) }),
    run: (a) => {
      logWater(a.amount_ml, 'ai')
      const t = today()
      return { ok: true, total_ml: t.totalMl, goal_ml: t.goalMl }
    }
  }),
  get_water_stats: tool({
    description: 'Water totals. Without a date: today, with logs and streak. With a date: that day total (last 366 days).',
    args: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD') }),
    run: (a) => {
      const t = today()
      if (!a.date || a.date === t.dayKey)
        return { ok: true, date: t.dayKey, total_ml: t.totalMl, goal_ml: t.goalMl, logs: t.logs.length, streak_days: t.streak }
      const d = history(366).find((h) => h.day === a.date)
      return d ? { ok: true, date: d.day, total_ml: d.totalMl, goal_ml: d.goalMl } : { error: 'Date out of range' }
    }
  }),
  set_water_goal: tool({
    description: 'Set the daily water goal in ml (switches to a manual goal).',
    args: z.object({ amount_ml: z.number().int().min(500).max(10000) }),
    run: (a) => {
      setSettings({ goalMode: 'manual', goalMl: a.amount_ml })
      petCue({ kind: 'say', text: `New goal: ${a.amount_ml} ml a day 🎯` })
      return { ok: true, goal_ml: a.amount_ml }
    }
  }),
  set_water_reminder_interval: tool({
    description: 'Set how often water reminders fire, in minutes.',
    args: z.object({ minutes: z.number().int().min(5).max(600) }),
    run: (a) => {
      setSettings({ reminderIntervalMin: a.minutes })
      return { ok: true, interval_min: a.minutes, active_hours: `${getSettings().activeStart}-${getSettings().activeEnd}` }
    }
  }),
  open_game: tool({
    description: 'Open a game to play against Sip in the dashboard: chess or tic-tac-toe. Sip plays with a real game engine.',
    args: z.object({ game: z.enum(['chess', 'tictactoe']) }),
    run: (a) => {
      bus.emit('msg', { type: 'open', tab: `games:${a.game}` })
      return { ok: true, opened: a.game, note: 'The board is open in the dashboard; the user plays there.' }
    }
  }),
  snooze_reminders: tool({
    description: 'Snooze water reminders for some minutes.',
    args: z.object({ minutes: z.number().int().min(1).max(1440) }),
    run: (a) => {
      const until = new Date(Date.now() + a.minutes * MIN)
      setSettings({ snoozedUntil: until.toISOString() })
      return { ok: true, snoozed_until: toLocalIso(until) }
    }
  })
}

export type ToolName = keyof typeof TOOLS
export interface PendingCall {
  name: ToolName
  args: unknown
  summary: string
}

function jsonSchema(s: z.ZodObject): object | undefined {
  if (!Object.keys(s.shape).length) return undefined
  const { $schema: _, additionalProperties: __, ...rest } = z.toJSONSchema(s, { io: 'input' }) as Record<string, unknown>
  return rest
}

export const functionDeclarations: FunctionDeclaration[] = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  parametersJsonSchema: jsonSchema(t.args)
}))

const isTool = (n: string): n is ToolName => Object.hasOwn(TOOLS, n)

/** Validate and run one model tool call. Destructive tools are queued into `pending` instead. */
export function executeTool(name: string, rawArgs: unknown, pending: PendingCall[]): Record<string, unknown> {
  if (!isTool(name)) return { error: `Unknown tool ${name}` }
  const t = TOOLS[name] as Tool<z.ZodObject>
  const parsed = t.args.safeParse(rawArgs ?? {})
  if (!parsed.success) return { error: `Invalid arguments: ${z.prettifyError(parsed.error)}` }
  try {
    if (t.confirm) {
      const summary = t.confirm(parsed.data)
      if (!summary) return { error: 'Target not found. Use a list tool to get valid ids.' }
      pending.push({ name, args: parsed.data, summary })
      return { status: 'pending_confirmation', message: 'Queued. The user must press Confirm in the chat. Do not say it is done.' }
    }
    return t.run(parsed.data) as Record<string, unknown>
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Run previously confirmed calls. Args were validated when queued. */
export function runConfirmed(calls: PendingCall[]): string[] {
  return calls.map((c) => {
    const r = (TOOLS[c.name] as Tool<z.ZodObject>).run(c.args as never) as { ok?: boolean }
    return `${r.ok ? '✅' : '⚠️'} ${c.summary.replace(/^Delete /, r.ok ? 'Deleted ' : 'Could not delete ')}`
  })
}
