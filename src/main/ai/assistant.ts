import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { ApiError, GoogleGenAI, type Content } from '@google/genai'
import { getApiKey } from '../secret'
import { petCue } from '../bus'
import { getSettings } from '../services/settings'
import { listEvents } from '../services/events'
import { listAlarms } from '../services/alarms'
import { today } from '../services/water'
import { addMessage, recentMessages } from '../services/chat'
import { buildSystemPrompt } from './prompt'
import { executeTool, functionDeclarations, runConfirmed, type PendingCall } from './tools'
import { runToolLoop, type Generate } from './runToolLoop'
import type { ChatReply } from '@shared/types'

const PENDING_TTL = 10 * 60_000

function client(): { ai: GoogleGenAI; model: string } | null {
  const key = getApiKey()
  // SIPPAL_GEMINI_BASE_URL (dev only) points the SDK at a local fake server for end-to-end tests.
  const baseUrl = app.isPackaged ? undefined : process.env.SIPPAL_GEMINI_BASE_URL
  return key ? { ai: new GoogleGenAI({ apiKey: key, httpOptions: baseUrl ? { baseUrl } : undefined }), model: getSettings().model } : null
}

const NO_KEY: ChatReply = { ok: false, code: 'no_key', message: 'I need a Gemini API key before I can chat. Add one in Settings 🔑' }

export function friendlyError(e: unknown): ChatReply & { ok: false } {
  const status = e instanceof ApiError ? e.status : undefined
  const msg = e instanceof Error ? e.message : String(e)
  console.error('[gemini] request failed', status ?? '', msg.slice(0, 200))
  if (status === 401 || status === 403 || (status === 400 && /api[_ ]?key/i.test(msg)))
    return { ok: false, code: 'invalid_key', message: "That API key doesn't seem to work. Check it in Settings 🔑" }
  if (status === 429) return { ok: false, code: 'rate_limit', message: "I'm being rate-limited (quota reached). Give it a minute, then retry ⏳" }
  if (status === 404) return { ok: false, code: 'unknown', message: `Model "${getSettings().model}" wasn't found. Check the model name in Settings.` }
  if (!status || status >= 500) return { ok: false, code: 'network', message: "I can't reach Gemini right now. Check your connection and retry 📡" }
  return { ok: false, code: 'unknown', message: `Gemini returned an error (${status}). Please retry.` }
}

const pendingById = new Map<string, { calls: PendingCall[]; at: number }>()

export async function sendMessage(text: string): Promise<ChatReply> {
  const c = client()
  if (!c) return NO_KEY
  addMessage('user', text)
  const s = getSettings()
  const history = recentMessages(s.historyTurns + 1).filter((m) => m.role !== 'system')
  while (history.length && history[0].role !== 'user') history.shift()
  const contents: Content[] = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }))

  const generate: Generate = async (cs) => {
    const t = today()
    const systemInstruction = buildSystemPrompt({
      now: new Date(),
      name: s.name,
      events: listEvents(),
      alarms: listAlarms(),
      water: { totalMl: t.totalMl, goalMl: t.goalMl, defaultCupMl: s.defaultCupMl, intervalMin: s.reminderIntervalMin }
    })
    const r = await c.ai.models.generateContent({ model: c.model, contents: cs, config: { systemInstruction, tools: [{ functionDeclarations }] } })
    return { functionCalls: r.functionCalls, text: r.text, content: r.candidates?.[0]?.content }
  }

  const pending: PendingCall[] = []
  try {
    const { text: reply, calls } = await runToolLoop(generate, contents, (n, a) => executeTool(n, a, pending))
    let card = null
    if (pending.length) {
      const id = randomUUID()
      pendingById.set(id, { calls: pending, at: Date.now() })
      card = { id, summary: pending.map((p) => p.summary) }
    }
    addMessage('model', reply, calls.length ? calls : undefined)
    return { ok: true, text: reply, pending: card }
  } catch (e) {
    return friendlyError(e)
  }
}

export function confirmPending(id: string, accept: boolean): ChatReply {
  const p = pendingById.get(id)
  pendingById.delete(id)
  if (!p || Date.now() - p.at > PENDING_TTL) return { ok: false, code: 'unknown', message: 'That request expired. Ask me again 🙂' }
  const text = accept ? runConfirmed(p.calls).join('\n') : 'Okay, cancelled — nothing was changed 👍'
  addMessage('model', text)
  if (accept) petCue({ kind: 'say', text })
  return { ok: true, text, pending: null }
}

export async function transcribe(wavBase64: string): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const c = client()
  if (!c) return { ok: false, message: 'Add a Gemini API key in Settings to use voice 🔑' }
  try {
    const r = await c.ai.models.generateContent({
      model: c.model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
            { text: 'Transcribe this speech exactly as spoken. Output only the transcript. If there is no speech, output nothing.' }
          ]
        }
      ]
    })
    return { ok: true, text: r.text?.trim() ?? '' }
  } catch (e) {
    return { ok: false, message: friendlyError(e).message }
  }
}

export async function testKey(): Promise<{ ok: boolean; message: string }> {
  const c = client()
  if (!c) return { ok: false, message: 'No key saved yet.' }
  try {
    await c.ai.models.generateContent({ model: c.model, contents: 'Reply with the single word OK.' })
    return { ok: true, message: `Key works with ${c.model} ✅` }
  } catch (e) {
    return { ok: false, message: friendlyError(e).message }
  }
}
