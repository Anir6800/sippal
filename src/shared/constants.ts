// Plain constants shared with renderers. Kept free of zod so renderer bundles stay small.
export const PET_THEMES = ['aqua', 'mint', 'lavender', 'peach'] as const
export const WATER_SOURCES = ['pet', 'dashboard', 'ai', 'tray', 'notification'] as const
export const RECURRENCES = ['none', 'daily', 'weekly', 'weekdays'] as const
export const EVENT_STATUSES = ['active', 'completed', 'cancelled'] as const
export const REPEATS = ['once', 'daily', 'weekdays', 'weekends', 'custom'] as const
export const SOUNDS = ['chime', 'beep', 'marimba', 'bells', 'system'] as const
