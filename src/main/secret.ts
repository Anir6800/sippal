import { safeStorage } from 'electron'
import { getDb } from './db'

// The Gemini key is encrypted with the OS keychain (DPAPI on Windows) and never leaves main.
const KEY = 'secret.geminiKey'

/** API keys are plain ASCII; pasted keys sometimes carry spaces or invisible characters that break the HTTP header. */
const clean = (k: string): string => k.replace(/[^!-~]/g, '')

export function setApiKey(raw: string): void {
  const key = clean(raw)
  if (!key) {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(KEY)
    return
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is unavailable; cannot store the API key safely.')
  const enc = safeStorage.encryptString(key).toString('base64')
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(KEY, JSON.stringify(enc))
}

export function getApiKey(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined
  if (!row) return null
  try {
    return clean(safeStorage.decryptString(Buffer.from(JSON.parse(row.value) as string, 'base64'))) || null
  } catch {
    return null // e.g. DB copied from another Windows account
  }
}

export const hasApiKey = (): boolean => getApiKey() !== null
