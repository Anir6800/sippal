import { useEffect, useRef, useState, type JSX } from 'react'
import { Chess, type Square } from 'chess.js'
import ChessWorker from '../../games/chess.worker?worker'
import type { EngineMove, Level } from '../../games/engine'
import { ghostBtn, primaryBtn } from '../ui'
import { LevelPicker, Score, reportResult, useScore, type Outcome } from './shared'

// Filled glyphs for both sides (coloured with CSS); ︎ stops ♟ turning into an emoji.
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' }
const FILES = 'abcdefgh'

type Color = 'w' | 'b'

export function ChessGame(): JSX.Element {
  const game = useRef(new Chess())
  const worker = useRef<Worker | null>(null)
  const [fen, setFen] = useState(game.current.fen())
  const [you, setYou] = useState<Color>('w')
  const [level, setLevel] = useState<Level>('medium')
  const [selected, setSelected] = useState<Square | null>(null)
  const [hint, setHint] = useState<EngineMove | null>(null)
  const [thinking, setThinking] = useState(false)
  const [score, record] = useScore('chess')
  const g = game.current
  const last = g.history({ verbose: true }).at(-1)

  useEffect(() => {
    worker.current = new ChessWorker()
    return () => worker.current?.terminate()
  }, [])

  const ask = (lvl: Level): Promise<EngineMove | null> =>
    new Promise((resolve) => {
      const w = worker.current!
      w.onmessage = (e: MessageEvent<EngineMove | null>) => resolve(e.data)
      w.postMessage({ fen: g.fen(), level: lvl })
    })

  const sync = (): void => {
    setFen(g.fen())
    setSelected(null)
    setHint(null)
    if (!g.isGameOver()) return
    const outcome: Outcome = g.isCheckmate() ? (g.turn() === you ? 'loss' : 'win') : 'draw'
    record(outcome)
    reportResult('chess', outcome)
  }

  // Sip plays whenever it's its turn.
  useEffect(() => {
    if (g.isGameOver() || g.turn() === you) return
    let cancelled = false
    setThinking(true)
    void ask(level).then((m) => {
      setThinking(false)
      if (cancelled || !m) return
      try {
        g.move(m)
      } catch {
        g.move(g.moves()[0]) // never expected (engine is perft-verified), but never get stuck
      }
      sync()
    })
    return () => {
      cancelled = true
    }
  }, [fen, you]) // eslint-disable-line react-hooks/exhaustive-deps

  const targets = selected ? g.moves({ square: selected, verbose: true }).map((m) => m.to) : []

  function click(sq: Square): void {
    if (thinking || g.isGameOver() || g.turn() !== you) return
    if (selected && targets.includes(sq)) {
      g.move({ from: selected, to: sq, promotion: 'q' }) // ponytail: always promotes to a queen
      sync()
      return
    }
    const p = g.get(sq)
    setSelected(p && p.color === you ? sq : null)
  }

  function newGame(color: Color | 'random' = you): void {
    worker.current?.terminate()
    worker.current = new ChessWorker()
    g.reset()
    setThinking(false)
    setYou(color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color)
    sync()
  }

  function takeBack(): void {
    g.undo()
    if (g.turn() !== you) g.undo()
    sync()
  }

  const status = g.isCheckmate()
    ? g.turn() === you
      ? 'Checkmate — Sip wins! 💧'
      : 'Checkmate — you win! 🎉'
    : g.isStalemate()
      ? 'Stalemate — draw 🤝'
      : g.isDraw()
        ? 'Draw 🤝'
        : thinking
          ? 'Sip is thinking…'
          : `${g.turn() === you ? 'Your move' : "Sip's move"}${g.isCheck() ? ' — check!' : ''}`

  const rows = you === 'w' ? [...Array(8).keys()] : [...Array(8).keys()].reverse()
  const cols = you === 'w' ? [...Array(8).keys()] : [...Array(8).keys()].reverse()
  const board = g.board()
  const moves = g.history()

  return (
    <div className="flex flex-wrap items-start gap-8" data-fen={fen}>
      <div>
        <p className="mb-3 text-lg font-semibold" aria-live="polite">
          {status}
        </p>
        <div className="grid grid-cols-8 overflow-hidden rounded-xl border-4 border-slate-700 shadow-lg" role="grid" aria-label="Chess board">
          {rows.flatMap((r) =>
            cols.map((c) => {
              const sq = `${FILES[c]}${8 - r}` as Square
              const p = board[r][c]
              const dark = (r + c) % 2 === 1
              const isTarget = targets.includes(sq)
              const hl =
                selected === sq
                  ? 'bg-yellow-300'
                  : hint && (hint.from === sq || hint.to === sq)
                    ? 'bg-violet-300'
                    : last && (last.from === sq || last.to === sq)
                      ? dark
                        ? 'bg-amber-600'
                        : 'bg-amber-200'
                      : p?.type === 'k' && p.color === g.turn() && g.isCheck()
                        ? 'bg-rose-400'
                        : dark
                          ? 'bg-emerald-700'
                          : 'bg-emerald-50'
              return (
                <button
                  key={sq}
                  aria-label={`${sq}${p ? ` ${p.color === 'w' ? 'white' : 'black'} ${p.type}` : ''}`}
                  onClick={() => click(sq)}
                  className={`relative flex h-14 w-14 items-center justify-center text-[40px] leading-none select-none ${hl}`}
                >
                  {p && (
                    <span
                      className={p.color === 'w' ? 'text-white' : 'text-slate-900'}
                      style={{ textShadow: p.color === 'w' ? '0 0 2px #000, 0 0 1px #000' : '0 0 2px #fff8' }}
                    >
                      {GLYPH[p.type]}
                    </span>
                  )}
                  {isTarget && <span className={`absolute rounded-full bg-slate-900/30 ${p ? 'inset-1 border-4 border-slate-900/30 bg-transparent' : 'h-4 w-4'}`} />}
                  {c === (you === 'w' ? 0 : 7) && <span className="absolute top-0.5 left-1 text-[10px] text-slate-500">{8 - r}</span>}
                  {r === (you === 'w' ? 7 : 0) && <span className="absolute right-1 bottom-0 text-[10px] text-slate-500">{FILES[c]}</span>}
                </button>
              )
            })
          )}
        </div>
      </div>

      <div className="w-64 space-y-4">
        <LevelPicker
          level={level}
          onChange={setLevel}
          hint={{ easy: 'Looks 2 moves ahead, makes mistakes', medium: 'Solid club player (~1 s per move)', hard: 'Thinks deeper (~2.5 s per move)' }}
        />
        <div className="flex flex-wrap gap-2">
          <button className={primaryBtn} onClick={() => newGame('w')}>
            Play White
          </button>
          <button className={primaryBtn} onClick={() => newGame('b')}>
            Play Black
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={ghostBtn} disabled={thinking || moves.length < 1} onClick={takeBack}>
            ↶ Take back
          </button>
          <button
            className={ghostBtn}
            disabled={thinking || g.isGameOver() || g.turn() !== you}
            onClick={async () => {
              setThinking(true)
              setHint(await ask('medium'))
              setThinking(false)
            }}
          >
            💡 Hint
          </button>
        </div>
        <Score score={score} />
        <div className="max-h-48 overflow-y-auto rounded-xl bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800">
          {moves.length ? (
            Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
              <div key={i}>
                {i + 1}. {moves[i * 2]} {moves[i * 2 + 1] ?? ''}
              </div>
            ))
          ) : (
            <span className="text-slate-400">Moves appear here</span>
          )}
        </div>
      </div>
    </div>
  )
}
