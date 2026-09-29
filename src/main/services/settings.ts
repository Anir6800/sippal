import { getDb } from '../db'
import { changed } from '../bus'
import { mergeSettings, type Settings, type SettingsPatch } from '@shared/settings'

// Keys starting with "meta." (app bookkeeping) and "secret." (encrypted key) share the table
// but are never part of Settings, exports of settings, or anything sent to a renderer.

export function getSettings(): Settings {
  const rows = getDb().prepare(`SELECT key, value FROM settings WHERE key NOT LIKE 'meta.%' AND key NOT LIKE 'secret.%'`).all() as {
    key: string
    value: string
  }[]
  return mergeSettings(Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])))
}

export function setSettings(patch: SettingsPatch): Settings {
  const stmt = getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  getDb().transaction(() => {
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) stmt.run(k, JSON.stringify(v))
  })()
  changed('settings')
  return getSettings()
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(`meta.${key}`) as { value: string } | undefined
  return row ? (JSON.parse(row.value) as string) : null
}

export function setMeta(key: string, value: string | null): void {
  if (value === null) getDb().prepare('DELETE FROM settings WHERE key = ?').run(`meta.${key}`)
  else getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(`meta.${key}`, JSON.stringify(value))
}
