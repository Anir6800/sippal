import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { api, useStore } from '../common/store'
import { ChatView } from '../common/ChatView'
import { DropletRenderer } from './DropletRenderer'
import { initialFsm, step, type Fsm, type PetEvent } from './fsm'
import { chirp, startAlarm, stopAlarm, tada } from './sounds'
import { Bubble, type CueInfo } from './Bubble'
import { inWindow } from '@shared/time'

const Renderer = DropletRenderer // swap for a sprite-sheet renderer with the same props
const ALARM_MAX_MS = 2 * 60_000
const CHAT_W = 320
const CHAT_H = 440

interface Model {
  x: number
  y: number
  vy: number
  facing: 1 | -1
  targetX: number
  cursorX: number
  cursorY: number
  dragOffX: number
  dragOffY: number
}

export function Pet(): JSX.Element | null {
  const settings = useStore((s) => s.settings)
  const [fsm, setFsm] = useState<Fsm>(() => initialFsm(Date.now()))
  const [chatOpen, setChatOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [cue, setCue] = useState<CueInfo>({})
  const [facing, setFacing] = useState<1 | -1>(-1)

  const fsmRef = useRef(fsm)
  const settingsRef = useRef(settings)
  const chatOpenRef = useRef(chatOpen)
  const hiddenRef = useRef(hidden)
  const petRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const kickRef = useRef<() => void>(() => undefined)
  const clickable = useRef(false)
  const down = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPoke = useRef(0)
  const m = useRef<Model>({ x: innerWidth - 200, y: innerHeight, vy: 0, facing: -1, targetX: 0, cursorX: 0, cursorY: 0, dragOffX: 0, dragOffY: 0 }).current

  const cueRef = useRef(cue)
  cueRef.current = cue
  settingsRef.current = settings
  chatOpenRef.current = chatOpen
  hiddenRef.current = hidden

  const size = settings?.petSize ?? 100

  /** Feed the FSM and run entry side effects. */
  const dispatch = useCallback((e: PetEvent) => {
    const prev = fsmRef.current
    const next = step(prev, e)
    if (next === prev) return
    fsmRef.current = next
    setFsm(next)
    if (next.state === prev.state && next.level === prev.level) return
    if (next.state === 'wander') m.targetX = Math.max(0, Math.min(innerWidth - size, m.x + (Math.random() * 2 - 1) * 420))
    if (next.state === 'escalate' && next.level !== prev.level) void api.invoke('pet:thirstyIgnored', { level: next.level })
    if (prev.state === 'alert' && next.state !== 'alert') stopAlarm()
    kickRef.current()
  }, [m, size])

  // ---------- animation loop: rAF while moving, a lazy 2 Hz tick otherwise ----------
  useEffect(() => {
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = performance.now()

    const physics = (dt: number): boolean => {
      const s = settingsRef.current
      const sz = s?.petSize ?? 100
      const ground = innerHeight - sz * 1.1
      const f = fsmRef.current
      let moving = false
      if (f.state === 'dragged') {
        m.x = m.cursorX - m.dragOffX
        m.y = m.cursorY - m.dragOffY
        moving = true
      } else {
        if (m.y < ground - 0.5) {
          m.vy += 2600 * dt
          m.y = Math.min(ground, m.y + m.vy * dt)
          moving = true
          if (m.y >= ground) {
            m.vy = 0
            petRef.current?.classList.remove('land')
            void petRef.current?.offsetWidth // restart the squash animation
            petRef.current?.classList.add('land')
          }
        } else m.y = ground
        let target: number | null = null
        let speed = 55
        if (f.state === 'wander') target = m.targetX
        if ((f.state === 'thirsty' || f.state === 'escalate') && !chatOpenRef.current) {
          const t = m.cursorX - sz / 2
          if (Math.abs(t - m.x) > sz * 0.9) target = t
          speed = 75 + f.level * 20
        }
        if (target !== null) {
          const dx = target - m.x
          if (Math.abs(dx) < 2) {
            if (f.state === 'wander') dispatch({ type: 'arrived', now: Date.now() })
          } else {
            const dir = dx > 0 ? 1 : -1
            if (dir !== m.facing) setFacing((m.facing = dir))
            m.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt)
            moving = true
          }
        }
      }
      m.x = Math.max(0, Math.min(innerWidth - sz, m.x))
      m.y = Math.max(0, Math.min(ground, m.y))
      return moving
    }

    const apply = (): void => {
      const el = petRef.current
      if (!el) return
      el.style.transform = `translate3d(${m.x}px, ${m.y}px, 0)`
      const sz = settingsRef.current?.petSize ?? 100
      const b = bubbleRef.current
      if (b) {
        // Keep the bubble on screen: shift it horizontally relative to the pet.
        const w = b.offsetWidth
        const left = Math.max(8, Math.min(innerWidth - w - 8, m.x + sz / 2 - w / 2))
        b.style.transform = `translateX(${left - m.x}px)`
      }
      const c = chatRef.current
      if (c) {
        const right = m.x + sz + CHAT_W + 16 < innerWidth
        const left = right ? sz + 8 : -CHAT_W - 8
        const top = Math.max(8, m.y + sz * 1.1 - CHAT_H) - m.y
        c.style.transform = `translate(${left}px, ${top}px)`
      }
    }

    const frame = (): void => {
      raf = 0
      timer = undefined
      if (hiddenRef.current) return
      const now = performance.now()
      const dt = Math.min(now - last, 100)
      last = now
      const s = settingsRef.current
      if (s)
        dispatch({
          type: 'tick',
          now: Date.now(),
          dt,
          rand: Math.random(),
          quiet: inWindow(new Date(), s.quietStart, s.quietEnd),
          movement: s.petMovement,
          escalationMs: s.escalationDelayMin * 60_000,
          frozen: chatOpenRef.current
        })
      const moving = physics(dt / 1000)
      apply()
      const st = fsmRef.current.state
      if (moving || st === 'wander' || st === 'dragged' || st === 'thirsty' || st === 'escalate') raf = requestAnimationFrame(frame)
      else timer = setTimeout(frame, 500)
    }

    kickRef.current = () => {
      if (raf || hiddenRef.current) return
      clearTimeout(timer)
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    kickRef.current()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [dispatch, m, hidden])

  // Re-position bubbles immediately when they appear.
  useLayoutEffect(() => kickRef.current(), [fsm.state, chatOpen, cue])

  // ---------- messages from main ----------
  useEffect(
    () =>
      api.on((msg) => {
        if (msg.type !== 'pet') return
        const c = msg.cue
        const now = Date.now()
        const s = settingsRef.current
        switch (c.kind) {
          case 'thirsty':
            setCue((p) => ({ ...p, thirsty: c.message }))
            dispatch({ type: 'thirsty', now })
            if (s?.petSounds) chirp()
            break
          case 'celebrate':
            setCue((p) => ({ ...p, celebrate: c }))
            dispatch({ type: 'drink', now })
            if (s?.petSounds) (c.goalReached ? tada : chirp)()
            break
          case 'alert':
            setCue((p) => ({ ...p, alert: c }))
            dispatch({ type: 'alert', now, timeoutMs: c.timeoutMs })
            if (c.alarm) startAlarm(c.alarm.sound, ALARM_MAX_MS)
            break
          case 'say':
            // Don't cover a ringing alarm's Dismiss/Snooze buttons with a chatty message.
            if (fsmRef.current.state === 'alert' && cueRef.current.alert?.alarm) break
            setCue((p) => ({ ...p, alert: { kind: 'alert', title: c.text, subtitle: '', timeoutMs: 4000 + c.text.length * 60 } }))
            dispatch({ type: 'alert', now, timeoutMs: 4000 + c.text.length * 60 })
            break
          case 'stopAlarm':
            stopAlarm()
            if (cueRef.current.alert?.alarm) dispatch({ type: 'dismiss', now })
            break
          case 'hidden':
            setHidden(c.hidden)
            if (c.hidden) setChatOpen(false)
            break
          case 'openChat':
            setChatOpen(true)
            break
          case 'blur':
            setChatOpen(false)
            break
        }
      }),
    [dispatch]
  )
  // ---------- chat focus & Esc ----------
  useEffect(() => {
    void api.invoke('pet:focus', chatOpen)
    if (!chatOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setChatOpen(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [chatOpen])

  // ---------- click-through: only the pet and its bubbles catch the mouse ----------
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      m.cursorX = e.clientX
      m.cursorY = e.clientY
      const now = Date.now()
      // Any cursor movement counts as "user is around"; a sleeping pet wakes on the next tick.
      if (now - lastPoke.current > 1000) {
        lastPoke.current = now
        fsmRef.current = { ...fsmRef.current, lastActivity: now }
      }
      const hit = !!down.current?.dragging || !!document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-hit]')
      if (hit !== clickable.current) {
        clickable.current = hit
        void api.invoke('pet:clickable', hit)
      }
    }
    addEventListener('mousemove', onMove)
    return () => removeEventListener('mousemove', onMove)
  }, [m])

  // ---------- pointer: click / double-click / drag ----------
  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    down.current = { x: e.clientX, y: e.clientY, dragging: false }
    m.dragOffX = e.clientX - m.x
    m.dragOffY = e.clientY - m.y
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = down.current
    if (!d) return
    m.cursorX = e.clientX
    m.cursorY = e.clientY
    if (!d.dragging && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
      d.dragging = true
      dispatch({ type: 'dragStart', now: Date.now() })
    }
  }
  const onPointerUp = (): void => {
    const d = down.current
    down.current = null
    if (!d) return
    if (d.dragging) {
      m.vy = 0
      dispatch({ type: 'dragEnd', now: Date.now() })
      return
    }
    dispatch({ type: 'poke', now: Date.now() })
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      void api.invoke('water:log', { amount_ml: settingsRef.current?.defaultCupMl ?? 250, source: 'pet' })
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        setChatOpen((o) => !o)
      }, 260)
    }
  }

  if (!settings) return null
  const showBubble = !chatOpen && ['thirsty', 'escalate', 'celebrate', 'alert'].includes(fsm.state)

  return (
    <div
      ref={petRef}
      className="pet"
      style={{ width: size, height: size * 1.1, display: hidden ? 'none' : undefined }}
      onAnimationEnd={(e) => e.animationName === 'squash' && petRef.current?.classList.remove('land')}
    >
      {showBubble && (
        <div ref={bubbleRef} data-hit className="absolute bottom-full left-0 mb-3">
          <Bubble fsm={fsm} cue={cue} settings={settings} dispatch={dispatch} />
        </div>
      )}
      {chatOpen && (
        <div
          ref={chatRef}
          data-hit
          className="bubble absolute top-0 left-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
          style={{ width: CHAT_W, height: CHAT_H }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
            <span>💧 Sip</span>
            <button onClick={() => setChatOpen(false)} className="rounded px-2 text-slate-400 hover:text-slate-700" aria-label="Close chat">
              ✕
            </button>
          </div>
          <div className="h-[calc(100%-37px)]">
            <ChatView compact autoFocus />
          </div>
        </div>
      )}
      <div
        data-hit
        title="Click: chat · Double-click: log water · Drag: move · Right-click: menu"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault()
          void api.invoke('pet:contextMenu')
        }}
        style={{ cursor: fsm.state === 'dragged' ? 'grabbing' : 'grab' }}
      >
        <Renderer state={fsm.state} facing={facing} level={fsm.level} size={size} theme={settings.petTheme} />
      </div>
    </div>
  )
}
