import { bestMove, type Level } from './engine'

// Runs the search off the UI thread so the board stays responsive while Sip "thinks".
self.onmessage = (e: MessageEvent<{ fen: string; level: Level }>) => {
  ;(self as unknown as Worker).postMessage(bestMove(e.data.fen, e.data.level))
}
