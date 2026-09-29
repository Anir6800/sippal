import { useState, type JSX } from 'react'
import { api } from '../../common/store'
import { Field, inputCls } from '../ui'

export type Outcome = 'win' | 'loss' | 'draw'
export type GameId = 'chess' | 'tictactoe'
type Tally = Record<Outcome, number>

/** Per-game win/loss/draw tally, remembered on this PC (a convenience, so localStorage is fine). */
export function useScore(game: GameId): [Tally, (o: Outcome) => void] {
  const key = `sippal.score.${game}`
  const [score, setScore] = useState<Tally>(() => {
    try {
      return { win: 0, loss: 0, draw: 0, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
    } catch {
      return { win: 0, loss: 0, draw: 0 }
    }
  })
  const record = (o: Outcome): void =>
    setScore((s) => {
      const next = { ...s, [o]: s[o] + 1 }
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // storage unavailable: keep the in-memory tally
      }
      return next
    })
  return [score, record]
}

/** Let the pet react to the result. */
export const reportResult = (game: GameId, result: Outcome): void => void api.invoke('games:result', { game, result })

export function Score({ score }: { score: Tally }): JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-sm">
      {(
        [
          ['You', score.win, 'text-emerald-500'],
          ['Sip', score.loss, 'text-sky-500'],
          ['Draws', score.draw, 'text-slate-400']
        ] as const
      ).map(([label, n, cls]) => (
        <div key={label} className="rounded-xl bg-slate-100 py-2 dark:bg-slate-700">
          <div className={`text-2xl font-bold ${cls}`}>{n}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  )
}

export function LevelPicker<L extends string>({ level, onChange, hint }: { level: L; onChange: (l: L) => void; hint: Record<L, string> }): JSX.Element {
  return (
    <Field label="Difficulty" hint={hint[level]}>
      <select className={inputCls} value={level} onChange={(e) => onChange(e.target.value as L)}>
        {(Object.keys(hint) as L[]).map((l) => (
          <option key={l} value={l}>
            {l[0].toUpperCase() + l.slice(1)}
          </option>
        ))}
      </select>
    </Field>
  )
}
