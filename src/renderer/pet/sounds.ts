import type { Sound } from '@shared/types'

// All sounds are synthesised with WebAudio, so there are no audio files to bundle or license.
let ctx: AudioContext | null = null
const ac = (): AudioContext => (ctx ??= new AudioContext())

function note(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25): void {
  const c = ac()
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + dur + 0.05)
}

/** One pattern per sound; returns its length in seconds. */
const PATTERNS: Record<Exclude<Sound, 'system'>, () => number> = {
  chime: () => ([659, 784, 988].forEach((f, i) => note(f, i * 0.18, 0.9)), 1.6),
  beep: () => ([0, 0.25, 0.5].forEach((t) => note(880, t, 0.15, 'square', 0.12)), 1.2),
  marimba: () => ([523, 659, 784, 659].forEach((f, i) => note(f, i * 0.14, 0.35, 'triangle', 0.3)), 1.3),
  bells: () => ([1047, 1319].forEach((f, i) => (note(f, i * 0.4, 1.4, 'sine', 0.2), note(f * 2.01, i * 0.4, 0.8, 'sine', 0.05))), 2)
}

let loop: ReturnType<typeof setTimeout> | null = null
let stopAt = 0

export function startAlarm(sound: Sound, maxMs: number): void {
  stopAlarm()
  if (sound === 'system') return // the OS notification plays its own sound
  stopAt = Date.now() + maxMs
  const play = (): void => {
    if (Date.now() > stopAt) return stopAlarm()
    loop = setTimeout(play, PATTERNS[sound]() * 1000)
  }
  play()
}

export function stopAlarm(): void {
  if (loop) clearTimeout(loop)
  loop = null
}

export const chirp = (): void => (note(880, 0, 0.12, 'sine', 0.12), note(1320, 0.08, 0.15, 'sine', 0.1))
export const tada = (): void => [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.1, 0.5, 'triangle', 0.2))
