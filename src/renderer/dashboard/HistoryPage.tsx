import { useEffect, useState, type JSX } from 'react'
import { api, useStore } from '../common/store'
import { Card } from './ui'
import type { DayTotal } from '@shared/types'

// ponytail: plain SVG bars; a chart library would add weight for a single bar chart.
function Bars({ data }: { data: DayTotal[] }): JSX.Element {
  const W = 700
  const H = 220
  const pad = 28
  const max = Math.max(...data.map((d) => Math.max(d.totalMl, d.goalMl)), 1)
  const bw = (W - pad) / Math.max(1, data.length)
  const y = (v: number): number => H - pad - (v / max) * (H - pad - 10)
  const goalY = y(data[data.length - 1]?.goalMl ?? 0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily water totals">
      <line x1={pad} x2={W} y1={goalY} y2={goalY} stroke="#22c55e" strokeDasharray="6 4" />
      <text x={W - 2} y={goalY - 4} textAnchor="end" className="fill-green-600 text-[10px]">
        goal
      </text>
      {data.map((d, i) => {
        const x = pad + i * bw + bw * 0.15
        const top = y(d.totalMl)
        const showLabel = data.length <= 7 || i % 5 === 0 || i === data.length - 1
        const label = new Date(`${d.day}T12:00`).toLocaleDateString([], data.length <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
        return (
          <g key={d.day}>
            <title>{`${d.day}: ${d.totalMl} ml`}</title>
            <rect x={x} y={top} width={bw * 0.7} height={H - pad - top} rx="3" fill={d.totalMl >= d.goalMl ? '#22c55e' : '#38bdf8'} />
            {showLabel && (
              <text x={x + bw * 0.35} y={H - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function HistoryPage(): JSX.Element {
  const [range, setRange] = useState<7 | 30>(7)
  const [data, setData] = useState<DayTotal[]>([])
  const today = useStore((s) => s.today) // changes whenever water changes → refetch
  useEffect(() => void api.invoke('water:history', { days: range }).then(setData), [range, today])

  const met = data.filter((d) => d.totalMl >= d.goalMl).length
  const avg = data.length ? Math.round(data.reduce((a, d) => a + d.totalMl, 0) / data.length) : 0
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-3xl font-bold">🔥 {today?.streak ?? 0}</div>
          <div className="text-sm text-slate-500">day streak</div>
        </Card>
        <Card>
          <div className="text-3xl font-bold">{avg} ml</div>
          <div className="text-sm text-slate-500">daily average ({range} days)</div>
        </Card>
        <Card>
          <div className="text-3xl font-bold">
            {met}/{data.length}
          </div>
          <div className="text-sm text-slate-500">days goal met</div>
        </Card>
      </div>
      <Card>
        <div className="mb-3 flex gap-2">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1 text-sm ${range === r ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
            >
              {r} days
            </button>
          ))}
        </div>
        <Bars data={data} />
      </Card>
    </div>
  )
}
