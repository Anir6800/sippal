import type { JSX } from 'react'
import { Card } from '../ui'
import { ChessGame } from './ChessGame'
import { TicTacToe } from './TicTacToe'
import type { GameId } from './shared'

export function GamesPage({ game, onGame }: { game: GameId; onGame: (g: GameId) => void }): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex gap-2">
        {(
          [
            ['chess', '♞ Chess'],
            ['tictactoe', '⭕ Tic-Tac-Toe']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => onGame(id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${game === id ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Both stay mounted so switching tabs never loses a game in progress. */}
      <Card className={game === 'chess' ? '' : 'hidden'}>
        <ChessGame />
      </Card>
      <Card className={game === 'tictactoe' ? '' : 'hidden'}>
        <TicTacToe />
      </Card>
    </div>
  )
}
