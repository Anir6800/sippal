import { useMemo, type JSX } from 'react'
import { api } from '../common/store'
import type { Fsm, PetEvent } from './fsm'
import type { PublicSettings } from '@shared/ipc'
import type { PetCue } from '@shared/types'
import { ESCALATE_LINES } from '@shared/water'

export interface CueInfo {
  thirsty?: string
  celebrate?: Extract<PetCue, { kind: 'celebrate' }>
  alert?: Extract<PetCue, { kind: 'alert' }>
}

interface Props {
  fsm: Fsm
  cue: CueInfo
  settings: PublicSettings
  dispatch: (e: PetEvent) => void
}

const btn = 'rounded-full px-2.5 py-1 text-xs font-semibold transition active:scale-95'

function Confetti({ count }: { count: number }): JSX.Element {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        dx: `${(Math.random() * 2 - 1) * 140}px`,
        dy: `${60 + Math.random() * 140}px`,
        color: ['#38bdf8', '#f472b6', '#facc15', '#34d399', '#a78bfa'][i % 5],
        delay: `${Math.random() * 0.25}s`
      })),
    [count]
  )
  return (
    <div className="pointer-events-none absolute top-full left-1/2">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{ background: p.color, animationDelay: p.delay, ['--dx' as string]: p.dx, ['--dy' as string]: p.dy }}
        />
      ))}
    </div>
  )
}

export function Bubble({ fsm, cue, settings, dispatch }: Props): JSX.Element | null {
  const now = (): number => Date.now()
  const log = (ml: number): void => void api.invoke('water:log', { amount_ml: ml, source: 'pet' })

  let body: JSX.Element
  let tone = 'bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'
  switch (fsm.state) {
    case 'thirsty':
    case 'escalate': {
      const text = fsm.state === 'escalate' ? ESCALATE_LINES[Math.min(fsm.level, ESCALATE_LINES.length) - 1] : cue.thirsty
      if (fsm.level >= 2) tone = 'bg-sky-50 text-sky-900 ring-2 ring-sky-400 dark:bg-sky-950 dark:text-sky-100'
      body = (
        <>
          <p className={`mb-2 font-semibold ${fsm.level >= 2 ? 'text-base' : 'text-sm'}`}>{text ?? 'Time to drink water! 💧'}</p>
          <div className="flex flex-wrap gap-1.5">
            {settings.cupPresets.map((ml) => (
              <button key={ml} className={`${btn} bg-sky-500 text-white hover:bg-sky-600`} onClick={() => log(ml)}>
                +{ml}ml
              </button>
            ))}
            <button
              className={`${btn} bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200`}
              onClick={() => {
                void api.invoke('water:snooze', { minutes: 10 })
                dispatch({ type: 'snooze', now: now() })
              }}
            >
              Snooze 10m
            </button>
          </div>
        </>
      )
      break
    }
    case 'celebrate': {
      const c = cue.celebrate
      if (!c) return null
      body = (
        <>
          <p className="text-sm font-semibold">
            {c.goalReached ? '🎉 Goal reached! ' : 'Yay! '}
            {c.totalMl} / {c.goalMl} ml
          </p>
          <button
            className="mt-1 text-xs text-sky-600 underline dark:text-sky-400"
            onClick={() => {
              void api.invoke('water:delete', { id: c.logId })
              dispatch({ type: 'dismiss', now: now() })
            }}
          >
            Undo
          </button>
          <Confetti count={c.goalReached ? 40 : 12} />
        </>
      )
      break
    }
    case 'alert': {
      const a = cue.alert
      if (!a) return null
      tone = 'bg-amber-50 text-amber-950 ring-2 ring-amber-300 dark:bg-amber-950 dark:text-amber-50'
      body = (
        <>
          <p className="text-sm font-bold whitespace-pre-line">{a.title}</p>
          {a.subtitle && <p className="text-xs opacity-80">{a.subtitle}</p>}
          <div className="mt-2 flex gap-1.5">
            {a.alarm ? (
              <>
                <button className={`${btn} bg-amber-500 text-white`} onClick={() => void api.invoke('alarm:respond', { id: a.alarm!.id, action: 'dismiss' })}>
                  Dismiss
                </button>
                <button className={`${btn} bg-slate-200 text-slate-700`} onClick={() => void api.invoke('alarm:respond', { id: a.alarm!.id, action: 'snooze' })}>
                  Snooze
                </button>
              </>
            ) : (
              a.subtitle && (
                <button className={`${btn} bg-amber-500 text-white`} onClick={() => dispatch({ type: 'dismiss', now: now() })}>
                  Got it
                </button>
              )
            )}
          </div>
        </>
      )
      break
    }
    default:
      return null
  }

  return (
    <div className={`bubble relative w-max max-w-[260px] rounded-2xl px-3 py-2 shadow-xl ${tone}`}>
      {body}
    </div>
  )
}
