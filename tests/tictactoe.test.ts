import { describe, expect, it } from 'vitest'
import { aiMove, winner, type Cell } from '../src/renderer/games/tictactoe'

describe('tic-tac-toe', () => {
  it('detects wins and draws', () => {
    expect(winner(['X', 'X', 'X', null, 'O', 'O', null, null, null])).toMatchObject({ mark: 'X', line: [0, 1, 2] })
    expect(winner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])).toBe('draw')
    expect(winner(Array(9).fill(null))).toBeNull()
  })

  it('hard AI never loses against every possible human strategy', () => {
    let games = 0
    // Explore the full game tree of human replies, for both "AI moves first" and "human moves first".
    const play = (b: Cell[], humanTurn: boolean, ai: 'X' | 'O'): void => {
      const w = winner(b)
      if (w) {
        games++
        if (w !== 'draw') expect(w.mark).toBe(ai)
        return
      }
      const human = ai === 'X' ? 'O' : 'X'
      if (!humanTurn) {
        const nb = [...b]
        nb[aiMove(nb, ai, 'hard')] = ai
        return play(nb, true, ai)
      }
      b.forEach((c, i) => {
        if (c) return
        const nb = [...b]
        nb[i] = human
        play(nb, false, ai)
      })
    }
    play(Array(9).fill(null), true, 'O')
    play(Array(9).fill(null), false, 'X')
    expect(games).toBeGreaterThan(100)
  })

  it('easy AI still takes a win and blocks a loss', () => {
    expect(aiMove(['O', 'O', null, 'X', 'X', null, null, null, null], 'O', 'easy')).toBe(2)
    expect(aiMove(['X', 'X', null, null, 'O', null, null, null, null], 'O', 'easy')).toBe(2)
  })
})
