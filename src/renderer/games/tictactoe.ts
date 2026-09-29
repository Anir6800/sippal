export type Cell = 'X' | 'O' | null
export type Level = 'easy' | 'medium' | 'hard'

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
]

export function winner(b: Cell[]): { mark: 'X' | 'O'; line: number[] } | 'draw' | null {
  for (const line of LINES) {
    const [a, c, d] = line
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a]!, line }
  }
  return b.every(Boolean) ? 'draw' : null
}

/** Minimax with depth preference: win fastest, lose slowest. Returns score for `me`. */
function minimax(b: Cell[], me: 'X' | 'O', turn: 'X' | 'O', depth: number): number {
  const w = winner(b)
  if (w === 'draw') return 0
  if (w) return w.mark === me ? 10 - depth : depth - 10
  let best = turn === me ? -Infinity : Infinity
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue
    b[i] = turn
    const s = minimax(b, me, turn === 'X' ? 'O' : 'X', depth + 1)
    b[i] = null
    best = turn === me ? Math.max(best, s) : Math.min(best, s)
  }
  return best
}

/**
 * Hard: perfect play (never loses). Medium: perfect 70% of the time. Easy: grabs a win or blocks
 * an immediate loss, otherwise plays randomly — beatable but not silly.
 */
export function aiMove(b: Cell[], me: 'X' | 'O', level: Level): number {
  const free = b.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0)
  const them = me === 'X' ? 'O' : 'X'
  const winsFor = (mark: 'X' | 'O'): number | undefined =>
    free.find((i) => {
      b[i] = mark
      const w = winner(b)
      b[i] = null
      return !!w && w !== 'draw'
    })
  const random = (): number => free[Math.floor(Math.random() * free.length)]
  if (level === 'easy') return winsFor(me) ?? winsFor(them) ?? random()
  if (level === 'medium' && Math.random() < 0.3) return random()
  let best = free[0]
  let bestScore = -Infinity
  for (const i of free) {
    b[i] = me
    const s = minimax(b, me, them, 1)
    b[i] = null
    if (s > bestScore || (s === bestScore && Math.random() < 0.3)) [best, bestScore] = [i, s] // vary equal moves
  }
  return best
}
