/*
 * Compact chess engine used only for the AI's search (chess.js enforces the rules in the UI).
 * 10×12 mailbox board, pseudo-legal generation + king-safety filter, negamax alpha-beta with
 * quiescence search, iterative deepening, MVV-LVA + killer move ordering, piece-square evaluation.
 * Squares: sq = 21 + row*10 + file, row 0 = rank 8. Pieces: +white / -black, 1..6 = P N B R Q K.
 */

const OFF = 7
const P = 1
const N = 2
const B = 3
const R = 4
const Q = 5
const K = 6
const MATE = 100_000
const VALUE = [0, 100, 320, 330, 500, 900, 0]
const KNIGHT = [-21, -19, -12, -8, 8, 12, 19, 21]
const DIAG = [-11, -9, 9, 11]
const ORTHO = [-10, -1, 1, 10]
const ALL = [...DIAG, ...ORTHO]

// Piece-square tables from White's view, index row*8+file (row 0 = rank 8).
// prettier-ignore
const PST: number[][] = [
  [],
  [ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
    0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ],
  [ -50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
    -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50 ],
  [ -20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
    -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20 ],
  [ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
    -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0 ],
  [ -20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
    0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20 ],
  [ -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20 ]
]
// prettier-ignore
const KING_END = [ -50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
  -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50 ]

// Castling rights: 1 = White O-O, 2 = White O-O-O, 4 = Black O-O, 8 = Black O-O-O.
const CASTLE_MASK = new Uint8Array(120).fill(15)
CASTLE_MASK[95] = 15 & ~3
CASTLE_MASK[98] = 15 & ~1
CASTLE_MASK[91] = 15 & ~2
CASTLE_MASK[25] = 15 & ~12
CASTLE_MASK[28] = 15 & ~4
CASTLE_MASK[21] = 15 & ~8

// Move = from | to << 7 | promo << 14 | flag << 17   (flag: 1 en passant, 2 castle, 3 double push)
const mv = (from: number, to: number, promo = 0, flag = 0): number => from | (to << 7) | (promo << 14) | (flag << 17)
const FROM = (m: number): number => m & 127
const TO = (m: number): number => (m >> 7) & 127
const PROMO = (m: number): number => (m >> 14) & 7
const FLAG = (m: number): number => (m >> 17) & 3

export const sqName = (sq: number): string => 'abcdefgh'[(sq - 21) % 10] + (8 - Math.floor((sq - 21) / 10))
const PIECES = ' pnbrqk'

export interface EngineMove {
  from: string
  to: string
  promotion?: 'q' | 'r' | 'b' | 'n'
}

export class Engine {
  b = new Int8Array(120)
  side = 1
  castle = 0
  ep = 0
  kings = [0, 0]
  nodes = 0
  private hist: { m: number; cap: number; castle: number; ep: number }[] = []
  private killers: number[][] = []
  private deadline = 0
  private aborted = false

  load(fen: string): void {
    const [board, turn, castling, ep] = fen.split(' ')
    this.b.fill(OFF)
    board.split('/').forEach((rowStr, row) => {
      let f = 0
      for (const ch of rowStr) {
        if (/\d/.test(ch)) {
          for (let i = 0; i < +ch; i++) this.b[21 + row * 10 + f++] = 0
          continue
        }
        const p = PIECES.indexOf(ch.toLowerCase())
        const sq = 21 + row * 10 + f++
        this.b[sq] = ch === ch.toUpperCase() ? p : -p
        if (p === K) this.kings[ch === 'K' ? 0 : 1] = sq
      }
    })
    this.side = turn === 'w' ? 1 : -1
    this.castle = (castling.includes('K') ? 1 : 0) | (castling.includes('Q') ? 2 : 0) | (castling.includes('k') ? 4 : 0) | (castling.includes('q') ? 8 : 0)
    this.ep = ep && ep !== '-' ? 21 + (8 - +ep[1]) * 10 + ('abcdefgh'.indexOf(ep[0])) : 0
    this.hist = []
  }

  attacked(sq: number, by: number): boolean {
    const b = this.b
    if (by === 1 ? b[sq + 9] === P || b[sq + 11] === P : b[sq - 9] === -P || b[sq - 11] === -P) return true
    for (const o of KNIGHT) if (b[sq + o] === N * by) return true
    for (const o of ALL) if (b[sq + o] === K * by) return true
    for (const o of DIAG) {
      let t = sq + o
      while (b[t] === 0) t += o
      if (b[t] === B * by || b[t] === Q * by) return true
    }
    for (const o of ORTHO) {
      let t = sq + o
      while (b[t] === 0) t += o
      if (b[t] === R * by || b[t] === Q * by) return true
    }
    return false
  }

  inCheck(): boolean {
    return this.attacked(this.kings[this.side === 1 ? 0 : 1], -this.side)
  }

  /** Pseudo-legal moves; `noisy` = captures and queen promotions only (for quiescence). */
  gen(noisy: boolean): number[] {
    const b = this.b
    const s = this.side
    const out: number[] = []
    const dir = s === 1 ? -10 : 10
    for (let sq = 21; sq < 99; sq++) {
      const p = b[sq] * s
      if (p <= 0 || p === OFF * s) continue
      if (p === P) {
        const to = sq + dir
        const promoRow = s === 1 ? to < 29 : to > 90
        const pushProm = (t: number, flag = 0): void => {
          if (promoRow) {
            out.push(mv(sq, t, Q))
            if (!noisy) out.push(mv(sq, t, N), mv(sq, t, R), mv(sq, t, B))
          } else out.push(mv(sq, t, 0, flag))
        }
        if (b[to] === 0 && (!noisy || promoRow)) {
          pushProm(to)
          const start = s === 1 ? sq > 80 : sq < 39
          if (!noisy && start && b[to + dir] === 0) out.push(mv(sq, to + dir, 0, 3))
        }
        for (const t of [to - 1, to + 1]) {
          if (b[t] !== OFF && b[t] * s < 0) pushProm(t)
          else if (t === this.ep && this.ep) out.push(mv(sq, t, 0, 1))
        }
        continue
      }
      const offsets = p === N ? KNIGHT : p === B ? DIAG : p === R ? ORTHO : ALL
      const slide = p === B || p === R || p === Q
      for (const o of offsets) {
        let t = sq + o
        for (;;) {
          const target = b[t]
          if (target === OFF || target * s > 0) break
          if (target !== 0) {
            out.push(mv(sq, t))
            break
          }
          if (!noisy) out.push(mv(sq, t))
          if (!slide) break
          t += o
        }
      }
      if (p === K && !noisy) {
        const home = s === 1 ? 95 : 25
        if (sq === home && !this.attacked(home, -s)) {
          const [ks, qs] = s === 1 ? [1, 2] : [4, 8]
          if (this.castle & ks && b[home + 1] === 0 && b[home + 2] === 0 && !this.attacked(home + 1, -s) && !this.attacked(home + 2, -s))
            out.push(mv(home, home + 2, 0, 2))
          if (this.castle & qs && b[home - 1] === 0 && b[home - 2] === 0 && b[home - 3] === 0 && !this.attacked(home - 1, -s) && !this.attacked(home - 2, -s))
            out.push(mv(home, home - 2, 0, 2))
        }
      }
    }
    return out
  }

  /** Returns false (and leaves the position unchanged) if the move leaves the mover in check. */
  make(m: number): boolean {
    const b = this.b
    const from = FROM(m)
    const to = TO(m)
    const flag = FLAG(m)
    const s = this.side
    const p = b[from]
    let cap = b[to]
    this.hist.push({ m, cap: 0, castle: this.castle, ep: this.ep })
    b[to] = PROMO(m) ? PROMO(m) * s : p
    b[from] = 0
    if (flag === 1) {
      const capSq = to - (s === 1 ? -10 : 10)
      cap = b[capSq]
      b[capSq] = 0
    } else if (flag === 2) {
      const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1]
      b[rt] = b[rf]
      b[rf] = 0
    }
    this.hist[this.hist.length - 1].cap = cap
    if (p * s === K) this.kings[s === 1 ? 0 : 1] = to
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to]
    this.ep = flag === 3 ? (from + to) / 2 : 0
    this.side = -s
    if (this.attacked(this.kings[s === 1 ? 0 : 1], -s)) {
      this.unmake()
      return false
    }
    return true
  }

  unmake(): void {
    const h = this.hist.pop()!
    const b = this.b
    const m = h.m
    const from = FROM(m)
    const to = TO(m)
    const flag = FLAG(m)
    this.side = -this.side
    const s = this.side
    b[from] = PROMO(m) ? P * s : b[to]
    if (flag === 1) {
      b[to] = 0
      b[to - (s === 1 ? -10 : 10)] = h.cap
    } else b[to] = h.cap
    if (flag === 2) {
      const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1]
      b[rf] = b[rt]
      b[rt] = 0
    }
    if (b[from] * s === K) this.kings[s === 1 ? 0 : 1] = from
    this.castle = h.castle
    this.ep = h.ep
  }

  perft(depth: number): number {
    if (depth === 0) return 1
    let n = 0
    for (const m of this.gen(false)) {
      if (!this.make(m)) continue
      n += this.perft(depth - 1)
      this.unmake()
    }
    return n
  }

  /** Static evaluation from the side to move's point of view. */
  evaluate(): number {
    const b = this.b
    let score = 0
    let nonPawn = 0
    let queens = 0
    const bishops = [0, 0]
    for (let sq = 21; sq < 99; sq++) {
      const p = b[sq]
      if (p === 0 || p === OFF) continue
      const t = p > 0 ? p : -p
      if (t === Q) queens++
      if (t !== P && t !== K) nonPawn += VALUE[t]
      if (t === B) bishops[p > 0 ? 0 : 1]++
    }
    const endgame = queens === 0 || nonPawn <= 2600
    for (let row = 0; row < 8; row++)
      for (let f = 0; f < 8; f++) {
        const p = b[21 + row * 10 + f]
        if (p === 0) continue
        const t = p > 0 ? p : -p
        const idx = p > 0 ? row * 8 + f : (7 - row) * 8 + f
        const pst = t === K && endgame ? KING_END[idx] : PST[t][idx]
        score += (p > 0 ? 1 : -1) * (VALUE[t] + pst)
      }
    if (bishops[0] >= 2) score += 30
    if (bishops[1] >= 2) score -= 30
    return score * this.side
  }

  private order(moves: number[], ply: number, first = 0): number[] {
    const b = this.b
    const k = this.killers[ply] ?? []
    const key = (m: number): number => {
      if (m === first) return 1e9
      const victim = b[TO(m)]
      if (victim !== 0) return 1e6 + VALUE[victim > 0 ? victim : -victim] * 10 - VALUE[Math.abs(b[FROM(m)])]
      if (FLAG(m) === 1) return 1e6 + 1000
      if (PROMO(m)) return 9e5 + VALUE[PROMO(m)]
      if (m === k[0]) return 8e5
      if (m === k[1]) return 7e5
      return 0
    }
    return moves.map((m) => [key(m), m]).sort((x, y) => y[0] - x[0]).map((x) => x[1])
  }

  private timeUp(): boolean {
    if ((++this.nodes & 1023) === 0 && performance.now() > this.deadline) this.aborted = true
    return this.aborted
  }

  private quiesce(alpha: number, beta: number, ply: number): number {
    if (this.timeUp()) return 0
    const stand = this.evaluate()
    if (stand >= beta) return beta
    if (stand > alpha) alpha = stand
    if (ply > 40) return alpha
    for (const m of this.order(this.gen(true), ply)) {
      if (!this.make(m)) continue
      const score = -this.quiesce(-beta, -alpha, ply + 1)
      this.unmake()
      if (this.aborted) return 0
      if (score >= beta) return beta
      if (score > alpha) alpha = score
    }
    return alpha
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number): number {
    if (this.timeUp()) return 0
    const check = this.inCheck()
    if (check && ply < 30) depth++ // check extension
    if (depth <= 0) return this.quiesce(alpha, beta, ply)
    let legal = 0
    for (const m of this.order(this.gen(false), ply)) {
      if (!this.make(m)) continue
      legal++
      const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1)
      this.unmake()
      if (this.aborted) return 0
      if (score >= beta) {
        if (this.b[TO(m)] === 0) this.killers[ply] = [m, (this.killers[ply] ?? [])[0]]
        return beta
      }
      if (score > alpha) alpha = score
    }
    if (!legal) return check ? -MATE + ply : 0
    return alpha
  }

  /**
   * Iterative deepening; returns the best move found before the time or depth limit.
   * `exact` scores every root move with a full window (slower) so callers can compare them.
   */
  search(maxDepth: number, timeMs: number, exact = false): { move: number; score: number; depth: number; scored: { m: number; s: number }[] } {
    this.deadline = performance.now() + timeMs
    this.aborted = false
    this.nodes = 0
    this.killers = []
    const root = this.gen(false).filter((m) => (this.make(m) ? (this.unmake(), true) : false))
    let best = root[0] ?? 0
    let bestScore = -Infinity
    let scored: { m: number; s: number }[] = []
    let reached = 0
    for (let depth = 1; depth <= maxDepth && root.length; depth++) {
      let alpha = -Infinity
      const iter: { m: number; s: number }[] = []
      for (const m of this.order(root, 0, best)) {
        this.make(m)
        const s = -this.negamax(depth - 1, -Infinity, exact ? Infinity : -alpha, 1)
        this.unmake()
        if (this.aborted) break
        iter.push({ m, s })
        if (s > alpha) alpha = s
      }
      if (this.aborted && iter.length === 0) break
      iter.sort((x, y) => y.s - x.s)
      // A partially searched iteration still helps if its best move beat the previous best.
      if (!this.aborted || iter[0].s > bestScore) {
        best = iter[0].m
        bestScore = iter[0].s
        scored = iter
        reached = depth
      }
      if (this.aborted || bestScore > MATE - 100) break
    }
    return { move: best, score: bestScore, depth: reached, scored }
  }

  toMove(m: number): EngineMove {
    const promo = PROMO(m)
    return { from: sqName(FROM(m)), to: sqName(TO(m)), ...(promo ? { promotion: ' pnbrqk'[promo] as EngineMove['promotion'] } : {}) }
  }
}

export type Level = 'easy' | 'medium' | 'hard'

/** Pick a move for the side to move in `fen`. Easy blunders on purpose; hard thinks up to ~2.5s. */
export function bestMove(fen: string, level: Level): EngineMove | null {
  const e = new Engine()
  e.load(fen)
  const cfg = { easy: [2, 300], medium: [4, 1000], hard: [64, 2500] }[level]
  const r = e.search(cfg[0], cfg[1], level === 'easy')
  if (!r.move) return null
  if (level === 'easy' && r.scored.length > 1) {
    // Choose randomly among moves within 1.5 pawns of the best: plausible but beatable.
    const ok = r.scored.filter((x) => x.s >= r.scored[0].s - 150)
    return e.toMove(ok[Math.floor(Math.random() * ok.length)].m)
  }
  return e.toMove(r.move)
}
