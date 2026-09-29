import { useState, type JSX } from 'react'
import { api, useStore } from '../common/store'
import { Card, Empty, ghostBtn, inputCls, primaryBtn, toast } from './ui'

function Ring({ value, goal }: { value: number; goal: number }): JSX.Element {
  const r = 70
  const c = 2 * Math.PI * r
  const pct = Math.min(1, value / goal)
  return (
    <svg width="180" height="180" viewBox="0 0 180 180" className="shrink-0">
      <circle cx="90" cy="90" r={r} fill="none" strokeWidth="16" className="stroke-slate-200 dark:stroke-slate-700" />
      <circle
        cx="90"
        cy="90"
        r={r}
        fill="none"
        strokeWidth="16"
        strokeLinecap="round"
        stroke={pct >= 1 ? '#22c55e' : '#0ea5e9'}
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 90 90)"
        style={{ transition: 'stroke-dasharray .6s ease' }}
      />
      <text x="90" y="86" textAnchor="middle" className="fill-slate-800 text-2xl font-bold dark:fill-slate-100">
        {value}
      </text>
      <text x="90" y="108" textAnchor="middle" className="fill-slate-400 text-xs">
        of {goal} ml
      </text>
    </svg>
  )
}

async function logAndToast(ml: number): Promise<void> {
  const { id } = await api.invoke('water:log', { amount_ml: ml, source: 'dashboard' })
  toast(`+${ml} ml logged 💧`, { label: 'Undo', run: () => void api.invoke('water:delete', { id }) })
}

const time = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function TodayPage(): JSX.Element {
  const today = useStore((s) => s.today)
  const settings = useStore((s) => s.settings)
  const [custom, setCustom] = useState('')
  if (!today || !settings) return <p className="text-slate-400">Loading…</p>

  const remaining = Math.max(0, today.goalMl - today.totalMl)
  const hold = [settings.snoozedUntil, settings.pausedUntil]
    .filter((x): x is string => !!x && new Date(x) > new Date())
    .sort()
    .pop()
  const customOk = Number(custom) >= 10 && Number(custom) <= 3000

  return (
    <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
      <Card className="flex items-center gap-6 md:col-span-2">
        <Ring value={today.totalMl} goal={today.goalMl} />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{remaining ? `${remaining} ml to go` : 'Goal reached! 🎉'}</h1>
          <p className="text-sm text-slate-500">
            🔥 Streak: <b>{today.streak}</b> day{today.streak === 1 ? '' : 's'} · Reminders every {settings.reminderIntervalMin} min (
            {settings.activeStart}–{settings.activeEnd})
          </p>
          {hold && (
            <p className="text-sm text-amber-600">
              Reminders on hold until {time(hold)}{' '}
              <button className="underline" onClick={() => void api.invoke('settings:set', { snoozedUntil: null, pausedUntil: null })}>
                resume
              </button>
            </p>
          )}
        </div>
      </Card>

      <Card title="Quick add">
        <div className="flex flex-wrap gap-2">
          {settings.cupPresets.map((ml) => (
            <button key={ml} className={primaryBtn} onClick={() => void logAndToast(ml)}>
              +{ml} ml
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (customOk) void logAndToast(Math.round(Number(custom))).then(() => setCustom(''))
          }}
        >
          <input
            className={`${inputCls} w-32`}
            type="number"
            min={10}
            max={3000}
            placeholder="Custom ml"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button className={ghostBtn} disabled={!customOk}>
            Add
          </button>
        </form>
      </Card>

      <Card title="Today's log">
        {today.logs.length ? (
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
            {today.logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <b>{l.amount_ml} ml</b>{' '}
                  <span className="text-slate-400">
                    · {time(l.logged_at)} · {l.source}
                  </span>
                </span>
                <button className="text-slate-400 hover:text-rose-500" title="Delete" onClick={() => void api.invoke('water:delete', { id: l.id })}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="🥛" text="Nothing yet today. Your first sip is one click away!" />
        )}
      </Card>
    </div>
  )
}
