import { getDb } from '../db'
import { changed } from '../bus'
import { toLocalIso } from '@shared/time'
import type { ChatMessage } from '@shared/types'

export function addMessage(role: ChatMessage['role'], content: string, toolCalls?: unknown): void {
  getDb()
    .prepare('INSERT INTO chat_history (role, content, tool_calls_json, created_at) VALUES (?, ?, ?, ?)')
    .run(role, content, toolCalls ? JSON.stringify(toolCalls) : null, toLocalIso(new Date()))
  changed('chat')
}

/** Most recent `n` messages, oldest first. */
export function recentMessages(n = 200): ChatMessage[] {
  return (
    getDb().prepare('SELECT id, role, content, created_at FROM chat_history ORDER BY id DESC LIMIT ?').all(n) as ChatMessage[]
  ).reverse()
}

export function clearChat(): void {
  getDb().prepare('DELETE FROM chat_history').run()
  changed('chat')
}

export function logReminder(kind: 'water' | 'alarm' | 'event', refId: number | null, action: 'done' | 'snoozed' | 'dismissed' | 'missed' | 'fired'): void {
  getDb().prepare('INSERT INTO reminder_log (kind, ref_id, fired_at, action) VALUES (?, ?, ?, ?)').run(kind, refId, toLocalIso(new Date()), action)
}
