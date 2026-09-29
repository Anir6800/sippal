/** Pure pet state machine. The component feeds it events; physics and drawing live elsewhere. */

export type PetState = 'idle' | 'wander' | 'sleep' | 'dragged' | 'thirsty' | 'escalate' | 'celebrate' | 'alert'

export interface Fsm {
  state: PetState
  since: number
  level: number // escalation level, 0..MAX_LEVEL
  resume: PetState | null // what to return to after a drag or an alert
  lastActivity: number
  alertTimeout: number | null
}

export type PetEvent =
  | { type: 'tick'; now: number; dt: number; rand: number; quiet: boolean; movement: boolean; escalationMs: number; frozen: boolean }
  | { type: 'thirsty' | 'drink' | 'snooze' | 'dismiss' | 'dragStart' | 'dragEnd' | 'poke' | 'arrived'; now: number }
  | { type: 'alert'; now: number; timeoutMs: number | null }

export const MAX_LEVEL = 3
export const SLEEP_AFTER_MS = 10 * 60_000
const CELEBRATE_MS = 3200
const MEAN_IDLE_MS = 30_000

export const initialFsm = (now: number): Fsm => ({ state: 'idle', since: now, level: 0, resume: null, lastActivity: now, alertTimeout: null })

const urgent = (s: PetState | null): boolean => s === 'thirsty' || s === 'escalate'
const to = (f: Fsm, state: PetState, now: number, extra: Partial<Fsm> = {}): Fsm => ({ ...f, state, since: now, ...extra })
/** After a drag/alert, go back to what matters; ambient states just become idle. */
const back = (f: Fsm, now: number): Fsm =>
  to(f, f.resume === 'thirsty' || f.resume === 'escalate' || f.resume === 'alert' || f.resume === 'celebrate' ? f.resume : 'idle', now, { resume: null })

export function step(f: Fsm, e: PetEvent): Fsm {
  const now = e.now
  switch (e.type) {
    case 'dragStart':
      return to(f, 'dragged', now, { resume: f.state === 'dragged' ? f.resume : f.state, lastActivity: now })
    case 'dragEnd':
      return f.state === 'dragged' ? back(f, now) : f
    case 'thirsty':
      if (f.state === 'dragged' || f.state === 'alert') return { ...f, resume: 'thirsty', level: 0 }
      return to(f, 'thirsty', now, { level: 0 })
    case 'drink':
      if (f.state === 'alert') return { ...f, resume: urgent(f.resume) ? null : f.resume, level: 0 }
      return to(f, 'celebrate', now, { level: 0, resume: null, lastActivity: now })
    case 'snooze':
      return urgent(f.state) ? to(f, 'idle', now, { level: 0 }) : f
    case 'alert':
      return to(f, 'alert', now, {
        alertTimeout: e.timeoutMs,
        resume: f.state === 'alert' || f.state === 'dragged' ? f.resume : f.state
      })
    case 'dismiss':
      if (f.state === 'celebrate') return to(f, 'idle', now)
      return f.state === 'alert' ? back(f, now) : f
    case 'poke':
      return f.state === 'sleep' ? to(f, 'idle', now, { lastActivity: now }) : { ...f, lastActivity: now }
    case 'arrived':
      return f.state === 'wander' ? to(f, 'idle', now) : f
    case 'tick':
      return tick(f, e)
  }
}

function tick(f: Fsm, e: Extract<PetEvent, { type: 'tick' }>): Fsm {
  const { now } = e
  const age = now - f.since
  switch (f.state) {
    case 'alert':
      return f.alertTimeout !== null && age > f.alertTimeout ? back(f, now) : f
    case 'celebrate':
      return age > CELEBRATE_MS ? to(f, 'idle', now) : f
    case 'thirsty':
    case 'escalate':
      return age > e.escalationMs && f.level < MAX_LEVEL ? to(f, 'escalate', now, { level: f.level + 1 }) : f
    case 'idle':
    case 'wander':
      if (e.quiet || now - f.lastActivity > SLEEP_AFTER_MS) return to(f, 'sleep', now)
      if (e.frozen && f.state === 'wander') return to(f, 'idle', now)
      // Poisson-ish start: on average one wander per MEAN_IDLE_MS of idling, never within 3s.
      if (f.state === 'idle' && e.movement && !e.frozen && age > 3000 && e.rand < e.dt / MEAN_IDLE_MS) return to(f, 'wander', now)
      return f
    case 'sleep':
      return !e.quiet && now - f.lastActivity < SLEEP_AFTER_MS ? to(f, 'idle', now) : f
    case 'dragged':
      return f
  }
}
