import { z } from 'zod'
import { parseIsoWithOffset } from './time'
import { EVENT_STATUSES, RECURRENCES, REPEATS, SOUNDS, WATER_SOURCES } from './constants'

export { EVENT_STATUSES, RECURRENCES, REPEATS, SOUNDS, WATER_SOURCES }

export const isoWithOffset = z.string().refine((s) => parseIsoWithOffset(s) !== null, {
  message: 'Must be an ISO 8601 datetime with an explicit UTC offset, e.g. 2026-09-29T18:00:00+05:30'
})
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM')

export type WaterSource = (typeof WATER_SOURCES)[number]

export interface WaterLog {
  id: number
  amount_ml: number
  logged_at: string // UTC ISO
  source: WaterSource
}

export interface WaterToday {
  totalMl: number
  goalMl: number
  logs: WaterLog[]
  dayKey: string
  streak: number
}

export interface DayTotal {
  day: string
  totalMl: number
  goalMl: number
}

// ---------- Events ----------
export type Recurrence = (typeof RECURRENCES)[number]

const remindList = z.array(z.number().int().min(0).max(10080)).max(5)

// Patch schemas are built from default-free fields: in zod 4, `.partial()` still applies
// `.default()`s, which would silently reset untouched fields on every update.
const eventFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullish(),
  start_at: isoWithOffset,
  end_at: isoWithOffset.nullish(),
  remind_before: remindList,
  recurrence: z.enum(RECURRENCES)
}
export const EventInput = z.object({
  ...eventFields,
  remind_before: remindList.default([10]),
  recurrence: z.enum(RECURRENCES).default('none')
})
export const EventPatch = z.object(eventFields).partial().extend({ status: z.enum(EVENT_STATUSES).optional() })
export type EventInput = z.input<typeof EventInput>
export type EventPatch = z.input<typeof EventPatch>

export interface CalEvent {
  id: number
  title: string
  description: string | null
  start_at: string
  end_at: string | null
  remind_before: number[]
  recurrence: Recurrence
  status: (typeof EVENT_STATUSES)[number]
  created_via: 'manual' | 'ai'
  created_at: string
  updated_at: string
}

// ---------- Alarms ----------
export type Repeat = (typeof REPEATS)[number]
export type Sound = (typeof SOUNDS)[number]

const alarmFields = {
  label: z.string().trim().min(1).max(80),
  time_hhmm: hhmm,
  repeat: z.enum(REPEATS),
  days: z.array(z.number().int().min(0).max(6)).max(7), // 0 = Sunday
  sound: z.enum(SOUNDS),
  snooze_min: z.number().int().min(1).max(60),
  enabled: z.boolean()
}
export const AlarmInput = z.object({
  ...alarmFields,
  repeat: alarmFields.repeat.default('once'),
  days: alarmFields.days.default([]),
  sound: alarmFields.sound.default('chime'),
  snooze_min: alarmFields.snooze_min.default(5),
  enabled: alarmFields.enabled.default(true)
})
export const AlarmPatch = z.object(alarmFields).partial()
export type AlarmInput = z.input<typeof AlarmInput>
export type AlarmPatch = z.input<typeof AlarmPatch>

export interface Alarm {
  id: number
  label: string
  time_hhmm: string
  repeat: Repeat
  days: number[]
  sound: Sound
  snooze_min: number
  enabled: boolean
  created_at: string
}

// ---------- Chat ----------
export interface ChatMessage {
  id: number
  role: 'user' | 'model' | 'system'
  content: string
  created_at: string
}

export interface PendingConfirmation {
  id: string
  summary: string[]
}

export type ChatReply =
  | { ok: true; text: string; pending: PendingConfirmation | null }
  | { ok: false; code: 'no_key' | 'invalid_key' | 'rate_limit' | 'network' | 'server' | 'unknown'; message: string }

// ---------- Bus ----------
export type Domain = 'water' | 'events' | 'alarms' | 'settings' | 'chat'

export type PetCue =
  | { kind: 'thirsty'; message: string }
  | { kind: 'celebrate'; totalMl: number; goalMl: number; goalReached: boolean; logId: number }
  | { kind: 'alert'; title: string; subtitle: string; alarm?: { id: number; sound: Sound }; timeoutMs: number | null }
  | { kind: 'say'; text: string }
  | { kind: 'stopAlarm' }
  | { kind: 'hidden'; hidden: boolean }
  | { kind: 'openChat' }
  | { kind: 'cursor'; x: number; y: number }
  | { kind: 'idle'; seconds: number }

export type BusMsg = { type: 'changed'; domain: Domain } | { type: 'pet'; cue: PetCue } | { type: 'open'; tab: string }
