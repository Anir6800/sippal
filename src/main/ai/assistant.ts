import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { ApiError, GoogleGenAI, type Content, type GenerateContentResponse } from '@google/genai'
import { getApiKey } from '../secret'
import { logLine } from '../log'
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

const FALLBACK_MODEL = 'gemini-3.5-flash'
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
type GenParams = Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>

/**
 * Gemini regularly answers 503 "high demand" (and 429 per-model quota). Retry briefly, then fall
 * back to an older Flash model, which has separate capacity and quota. Other errors throw at once.
 */
function client(): { model: string; generate: (p: GenParams) => Promise<{ r: GenerateContentResponse; model: string }> } | null {
  const key = getApiKey()
  if (!key) return null
  // SIPPAL_GEMINI_BASE_URL (dev only) points the SDK at a local fake server for end-to-end tests.
  const baseUrl = app.isPackaged ? undefined : process.env.SIPPAL_GEMINI_BASE_URL
  const ai = new GoogleGenAI({ apiKey: key, httpOptions: baseUrl ? { baseUrl } : undefined })
  const model = getSettings().model
  const models = model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL]
  return {
    model,
    async generate(p) {
      let last: unknown
      for (const m of models)
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            return { r: await ai.models.generateContent({ ...p, model: m }), model: m }
          } catch (e) {
            last = e
            const status = e instanceof ApiError ? e.status : 0
            if (!(status >= 500 || status === 429)) throw e
            logLine('[gemini] busy, retrying', m, status)
            if (status === 429) break // quota won't recover in a second; try the fallback model
            await sleep(700 * (attempt + 1))
          }
        }
      throw last
    }
  }
}

const NO_KEY: ChatReply = { ok: false, code: 'no_key', message: 'I need a Gemini API key before I can chat. Add one in Settings 🔑' }

/** Google's own error text (the SDK puts the JSON body in the message), with anything key-like removed. */
function detailOf(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  let text = raw
  try {
    text = (JSON.parse(raw.slice(raw.indexOf('{'))) as { error?: { message?: string } }).error?.message ?? raw
  } catch {
    // not JSON
  }
  const cause = e instanceof Error && e.cause ? ` (${(e.cause as { code?: string }).code ?? String(e.cause)})` : ''
  return (text + cause).replace(/AIza[0-9A-Za-z_-]{10,}|AQ\.[0-9A-Za-z_.-]{10,}/g, '[key]').slice(0, 220)
}

export function friendlyError(e: unknown): ChatReply & { ok: false } {
  const status = e instanceof ApiError ? e.status : undefined
  const detail = detailOf(e)
  logLine('[gemini] request failed', status ?? 'no-status', detail)
  const fail = (code: Extract<ChatReply, { ok: false }>['code'], message: string): ChatReply & { ok: false } => ({
    ok: false,
    code,
    message: `${message}

Details: ${status ? `${status} · ` : ''}${detail}`
  })
  if (status === 401 || status === 403 || (status === 400 && /api[_ ]?key/i.test(detail)))
    return fail('invalid_key', "That API key doesn't seem to work. Check it in Settings 🔑")
  if (status === 429) return fail('rate_limit', "I'm being rate-limited (quota reached). Give it a minute, then retry ⏳")
  if (status === 404) return fail('unknown', `Model "${getSettings().model}" wasn't found. Check the model name in Settings.`)
  if (status && status >= 500) return fail('server', 'Gemini is busy or having trouble right now. Please retry in a moment ⏳')
  if (!status) return fail('network', "I can't reach Gemini right now. Check your connection and retry 📡")
  return fail('unknown', `Gemini returned an error (${status}).`)
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
    const { r } = await c.generate({ contents: cs, config: { systemInstruction, tools: [{ functionDeclarations }] } })
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
    const { r } = await c.generate({
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
    const { model } = await c.generate({ contents: 'Reply with the single word OK.' })
    return {
      ok: true,
      message: model === c.model ? `Key works with ${model} ✅` : `Key works ✅ (${c.model} is overloaded right now, so ${model} answered; SipPal falls back automatically)`
    }
  } catch (e) {
    return { ok: false, message: friendlyError(e).message }
  }
}
