import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { Engine, bestMove } from '../src/renderer/games/engine'

// Standard perft positions/results (chessprogramming.org). Any move-generation bug shows up here.
const PERFT: [string, number[]][] = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]], // "Kiwipete": castling, pins, en passant
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]], // en-passant discovered checks
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]], // promotions
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]]
]

describe('chess engine move generation (perft)', () => {
  for (const [fen, counts] of PERFT)
    it(fen.split(' ')[0], () => {
      const e = new Engine()
      e.load(fen)
      counts.forEach((n, i) => expect(e.perft(i + 1)).toBe(n))
    })
})

describe('chess engine play', () => {
  it('finds mate in one', () => {
    expect(bestMove('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'medium')).toEqual({ from: 'd1', to: 'd8' })
  })
  it('wins a hanging queen', () => {
    expect(bestMove('rnb1kbnr/pppp1ppp/8/4p3/3P3q/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1', 'medium')?.to).not.toBe(undefined)
    expect(bestMove('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', 'medium')).toEqual({ from: 'd2', to: 'd5' })
  })
  it('defends against mate in one', () => {
    // Black threatens the back-rank mate Re1#; luft, Kf1 or Bd2 all defend.
    const fen = '4r1k1/5ppp/8/8/8/8/5PPP/2B3K1 w - - 0 1'
    const m = bestMove(fen, 'hard')!
    const c = new Chess(fen)
    c.move(m)
    expect(c.moves({ verbose: true }).some((x) => { c.move(x); const mate = c.isCheckmate(); c.undo(); return mate })).toBe(false)
  })
  it('always returns a legal move, including promotions', () => {
    for (const fen of PERFT.map((p) => p[0])) {
      const m = bestMove(fen, 'easy')!
      expect(() => new Chess(fen).move(m)).not.toThrow()
    }
  })
})
