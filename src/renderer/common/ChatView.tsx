import { useEffect, useRef, useState, type JSX } from 'react'
import { api, useStore } from './store'
import { speak, startRecording, stopRecording } from './voice'
import type { ChatReply, PendingConfirmation } from '@shared/types'

interface Props {
  compact?: boolean
  autoFocus?: boolean
}

type ErrorReply = Extract<ChatReply, { ok: false }>

export function ChatView({ compact, autoFocus }: Props): JSX.Element {
  const chat = useStore((s) => s.chat)
  const settings = useStore((s) => s.settings)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<{ reply: ErrorReply; retry: () => void } | null>(null)
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const messages = compact ? chat.slice(-30) : chat

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length, busy, pending, error])

  function handle(reply: ChatReply, retry: () => void): void {
    if (reply.ok) {
      setError(null)
      setPending(reply.pending)
      if (settings?.tts) speak(reply.text)
    } else setError({ reply, retry })
  }

  async function send(msg: string): Promise<void> {
    const m = msg.trim()
    if (!m || busy) return
    setText('')
    setBusy(true)
    setPending(null)
    try {
      handle(await api.invoke('ai:send', { text: m }), () => void send(m))
    } finally {
      setBusy(false)
    }
  }

  async function confirm(accept: boolean): Promise<void> {
    if (!pending) return
    const id = pending.id
    setPending(null)
    handle(await api.invoke('ai:confirm', { id, accept }), () => undefined)
  }

  async function micDown(): Promise<void> {
    try {
      await startRecording()
      setRecording(true)
    } catch {
      setError({ reply: { ok: false, code: 'unknown', message: "Couldn't access the microphone 🎙️" }, retry: () => undefined })
    }
  }

  async function micUp(): Promise<void> {
    if (!recording) return
    setRecording(false)
    setBusy(true)
    const wav = await stopRecording()
    if (!wav) return setBusy(false)
    const r = await api.invoke('ai:transcribe', { wavBase64: wav })
    setBusy(false)
    if (r.ok && r.text) void send(r.text)
    else if (!r.ok) setError({ reply: { ok: false, code: 'unknown', message: r.message }, retry: () => undefined })
  }

  const bubble = 'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words'
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {!messages.length && (
          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Hi {settings?.name ?? 'there'}! Try “set a meeting at 6”, “I drank a bottle of water” or “wake me up at 7 every weekday”.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`${bubble} ${m.role === 'user' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className={`${bubble} w-fit animate-pulse bg-slate-100 text-slate-500 dark:bg-slate-700`}>Sip is thinking…</div>}
        {pending && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <p className="mb-1 font-semibold">Please confirm</p>
            <ul className="mb-2 list-disc pl-5">
              {pending.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button onClick={() => void confirm(true)} className="rounded-lg bg-rose-500 px-3 py-1 font-medium text-white hover:bg-rose-600">
                Confirm
              </button>
              <button onClick={() => void confirm(false)} className="rounded-lg bg-slate-200 px-3 py-1 hover:bg-slate-300 dark:bg-slate-600">
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
            <p className="mb-2">{error.reply.message}</p>
            <div className="flex gap-2">
              {error.reply.code === 'no_key' || error.reply.code === 'invalid_key' ? (
                <button onClick={() => void api.invoke('app:openDashboard', 'settings')} className="rounded-lg bg-rose-500 px-3 py-1 text-white">
                  Open Settings
                </button>
              ) : (
                (error.reply.code === 'network' || error.reply.code === 'rate_limit') && (
                  <button onClick={error.retry} className="rounded-lg bg-rose-500 px-3 py-1 text-white">
                    Retry
                  </button>
                )
              )}
              <button onClick={() => setError(null)} className="rounded-lg px-3 py-1 hover:bg-rose-100 dark:hover:bg-rose-900">
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-slate-200 p-2 dark:border-slate-700"
        onSubmit={(e) => {
          e.preventDefault()
          void send(text)
        }}
      >
        <input
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={recording ? 'Listening…' : 'Message Sip…'}
          maxLength={4000}
          className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-700 dark:text-slate-100"
        />
        {settings?.voiceInput && (
          <button
            type="button"
            title="Hold to talk"
            onPointerDown={() => void micDown()}
            onPointerUp={() => void micUp()}
            onPointerLeave={() => void micUp()}
            className={`h-9 w-9 shrink-0 rounded-full text-lg ${recording ? 'animate-pulse bg-rose-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
          >
            🎙️
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()} className="h-9 shrink-0 rounded-xl bg-sky-500 px-3 text-sm font-medium text-white disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  )
}
