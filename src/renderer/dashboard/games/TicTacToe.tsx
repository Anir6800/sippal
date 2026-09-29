import { useEffect, useState, type JSX } from 'react'
import { aiMove, winner, type Cell, type Level } from '../../games/tictactoe'
import { ghostBtn } from '../ui'
import { LevelPicker, Score, reportResult, useScore } from './shared'

export function TicTacToe(): JSX.Element {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null))
  const [level, setLevel] = useState<Level>('hard')
  const [sipFirst, setSipFirst] = useState(false)
  const [score, record] = useScore('tictactoe')
  const you = sipFirst ? 'O' : 'X'
  const sip = sipFirst ? 'X' : 'O'
  const result = winner(board)
  const turn = board.filter(Boolean).length % 2 === 0 ? 'X' : 'O'
  const sipTurn = !result && turn === sip

  // Sip's move, with a short "thinking" pause so it feels like a turn.
  useEffect(() => {
    if (!sipTurn) return
    const t = setTimeout(
      () =>
        setBoard((b) => {
          const pick = aiMove([...b], sip, level)
          return b.map((c, i) => (i === pick ? sip : c))
        }),
      450
    )
    return () => clearTimeout(t)
  }, [sipTurn, sip, level])

  // Keyed on a string: `winner()` returns a fresh object every render, which would re-fire forever.
  const outcome = !result ? null : result === 'draw' ? 'draw' : result.mark === you ? 'win' : 'loss'
  useEffect(() => {
    if (!outcome) return
    record(outcome)
    reportResult('tictactoe', outcome)
  }, [outcome]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = (first = sipFirst): void => {
    setSipFirst(first)
    setBoard(Array(9).fill(null))
  }
  const line = result && result !== 'draw' ? result.line : []
  const status = result
    ? result === 'draw'
      ? "It's a draw 🤝"
      : result.mark === you
        ? 'You win! 🎉'
        : 'Sip wins! 💧'
    : sipTurn
      ? 'Sip is thinking…'
      : `Your turn (${you})`

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div>
        <p className="mb-3 text-lg font-semibold" aria-live="polite">
          {status}
        </p>
        <div className="grid grid-cols-3 gap-2" role="grid" aria-label="Tic-tac-toe board">
          {board.map((c, i) => (
            <button
              key={i}
              aria-label={`Cell ${i + 1}${c ? `, ${c}` : ''}`}
              disabled={!!c || !!result || sipTurn}
              onClick={() => setBoard((b) => b.map((x, j) => (j === i ? you : x)))}
              className={`flex h-24 w-24 items-center justify-center rounded-2xl text-5xl font-bold transition ${
                line.includes(i) ? 'bg-emerald-200 dark:bg-emerald-800' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600'
              } ${c === 'X' ? 'text-sky-500' : 'text-rose-500'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="w-64 space-y-4">
        <LevelPicker level={level} onChange={setLevel} hint={{ easy: 'Blocks obvious wins', medium: 'Mostly perfect', hard: 'Perfect play — unbeatable' }} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-sky-500" checked={sipFirst} onChange={(e) => reset(e.target.checked)} />
          Sip goes first
        </label>
        <button className={ghostBtn} onClick={() => reset()}>
          New game
        </button>
        <Score score={score} />
      </div>
    </div>
  )
}
