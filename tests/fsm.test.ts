import { describe, expect, it } from 'vitest'
import { initialFsm, step, MAX_LEVEL, SLEEP_AFTER_MS, type Fsm } from '../src/renderer/pet/fsm'

const tick = (f: Fsm, now: number, o: Partial<{ quiet: boolean; rand: number; frozen: boolean }> = {}): Fsm =>
  step(f, { type: 'tick', now, dt: 16, rand: 1, quiet: false, movement: true, escalationMs: 5 * 60_000, frozen: false, ...o })

describe('pet state machine', () => {
  it('thirsty escalates on each ignored interval, capped', () => {
    let f = step(initialFsm(0), { type: 'thirsty', now: 0 })
    expect(f.state).toBe('thirsty')
    let t = 0
    for (let i = 0; i < 6; i++) f = tick(f, (t += 5 * 60_000 + 1))
    expect(f.state).toBe('escalate')
    expect(f.level).toBe(MAX_LEVEL)
  })

  it('drinking celebrates, then returns to idle', () => {
    let f = step(step(initialFsm(0), { type: 'thirsty', now: 0 }), { type: 'drink', now: 10 })
    expect(f).toMatchObject({ state: 'celebrate', level: 0 })
    f = tick(f, 10_000)
    expect(f.state).toBe('idle')
  })

  it('alerts pre-empt thirst and resume it afterwards', () => {
    let f = step(initialFsm(0), { type: 'thirsty', now: 0 })
    f = step(f, { type: 'alert', now: 1, timeoutMs: 1000 })
    expect(f.state).toBe('alert')
    f = tick(f, 2000)
    expect(f.state).toBe('thirsty')
  })

  it('drag remembers and restores the important state', () => {
    let f = step(initialFsm(0), { type: 'thirsty', now: 0 })
    f = step(f, { type: 'dragStart', now: 1 })
    expect(f.state).toBe('dragged')
    f = step(f, { type: 'dragEnd', now: 2 })
    expect(f.state).toBe('thirsty')
    // ambient states become idle after a drag
    f = step(step({ ...initialFsm(0), state: 'wander' }, { type: 'dragStart', now: 1 }), { type: 'dragEnd', now: 2 })
    expect(f.state).toBe('idle')
  })

  it('sleeps in quiet hours or after inactivity and wakes on activity', () => {
    expect(tick(initialFsm(0), 1, { quiet: true }).state).toBe('sleep')
    let f = tick(initialFsm(0), SLEEP_AFTER_MS + 1)
    expect(f.state).toBe('sleep')
    f = step(f, { type: 'poke', now: SLEEP_AFTER_MS + 2 })
    expect(f.state).toBe('idle')
  })

  it('wanders only when idle long enough, allowed and not frozen', () => {
    const idle = initialFsm(0)
    expect(tick(idle, 5000, { rand: 0 }).state).toBe('wander')
    expect(tick(idle, 1000, { rand: 0 }).state).toBe('idle')
    expect(tick(idle, 5000, { rand: 0, frozen: true }).state).toBe('idle')
    expect(step(idle, { type: 'tick', now: 5000, dt: 16, rand: 0, quiet: false, movement: false, escalationMs: 1, frozen: false }).state).toBe('idle')
  })
})
