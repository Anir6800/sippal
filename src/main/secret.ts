import { safeStorage } from 'electron'
import { getDb } from './db'

// The Gemini key is encrypted with the OS keychain (DPAPI on Windows) and never leaves main.
const KEY = 'secret.geminiKey'

export function setApiKey(key: string): void {
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
    return safeStorage.decryptString(Buffer.from(JSON.parse(row.value) as string, 'base64'))
  } catch {
    return null // e.g. DB copied from another Windows account
  }
}

export const hasApiKey = (): boolean => getApiKey() !== null
