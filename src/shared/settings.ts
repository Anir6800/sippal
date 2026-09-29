import { z } from 'zod'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')

import { PET_THEMES } from './constants'

export { PET_THEMES }
export const DEFAULT_MODEL = 'gemini-3.8-flash'

/** One validator per setting. No defaults here so `.partial()` stays a true patch schema. */
export const settingsShape = {
  name: z.string().trim().min(1).max(40),
  weightKg: z.number().min(20).max(300).nullable(),
  goalMode: z.enum(['manual', 'weight']),
  goalMl: z.number().int().min(500).max(10000),
  cupPresets: z.array(z.number().int().min(10).max(3000)).min(1).max(6),
  defaultCupMl: z.number().int().min(10).max(3000),
  reminderIntervalMin: z.number().int().min(5).max(600),
  activeStart: hhmm,
  activeEnd: hhmm,
  dayResetHour: z.number().int().min(0).max(23),
  keepReminding: z.boolean(),
  escalationDelayMin: z.number().int().min(1).max(120),
  petVisible: z.boolean(),
  petSize: z.number().int().min(60).max(160),
  petTheme: z.enum(PET_THEMES),
  petMovement: z.boolean(),
  petSounds: z.boolean(),
  quietStart: hhmm,
  quietEnd: hhmm,
  hideInFullscreen: z.boolean(),
  model: z.string().trim().min(1).max(80),
  historyTurns: z.number().int().min(0).max(100),
  tts: z.boolean(),
  voiceInput: z.boolean(),
  launchAtLogin: z.boolean(),
  notificationSound: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  // Runtime state kept alongside settings: ISO strings or null.
  snoozedUntil: z.string().nullable(),
  pausedUntil: z.string().nullable()
}

export const SettingsPatch = z.object(settingsShape).partial().strict()
export type Settings = { [K in keyof typeof settingsShape]: z.infer<(typeof settingsShape)[K]> }
export type SettingsPatch = z.infer<typeof SettingsPatch>

export const DEFAULT_SETTINGS: Settings = {
  name: 'Aniruddh',
  weightKg: null,
  goalMode: 'manual',
  goalMl: 2500,
  cupPresets: [150, 250, 500],
  defaultCupMl: 250,
  reminderIntervalMin: 45,
  activeStart: '09:00',
  activeEnd: '22:00',
  dayResetHour: 4,
  keepReminding: false,
  escalationDelayMin: 5,
  petVisible: true,
  petSize: 100,
  petTheme: 'aqua',
  petMovement: true,
  petSounds: true,
  quietStart: '23:00',
  quietEnd: '07:00',
  hideInFullscreen: true,
  model: DEFAULT_MODEL,
  historyTurns: 20,
  tts: false,
  voiceInput: true,
  launchAtLogin: false,
  notificationSound: true,
  theme: 'system',
  snoozedUntil: null,
  pausedUntil: null
}

/** Merge stored raw values over defaults, dropping anything that no longer validates. */
export function mergeSettings(raw: Record<string, unknown>): Settings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const [k, schema] of Object.entries(settingsShape)) {
    if (!(k in raw)) continue
    const r = (schema as z.ZodType).safeParse(raw[k])
    if (r.success) out[k] = r.data
  }
  return out as Settings
}
