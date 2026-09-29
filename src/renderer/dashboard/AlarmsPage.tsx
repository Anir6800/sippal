import { useState, type JSX } from 'react'
import { api, useStore } from '../common/store'
import { Card, Empty, Field, ghostBtn, inputCls, primaryBtn, toast } from './ui'
import { REPEATS, SOUNDS } from '@shared/constants'
import type { Alarm, Repeat, Sound } from '@shared/types'
import { startAlarm, stopAlarm } from '../pet/sounds'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const blank = { label: '', time_hhmm: '07:00', repeat: 'once' as Repeat, days: [] as number[], sound: 'chime' as Sound, snooze_min: 5 }

export function AlarmsPage(): JSX.Element {
  const alarms = useStore((s) => s.alarms)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<number | null>(null)

  async function submit(): Promise<void> {
    try {
      if (editing) await api.invoke('alarms:update', { id: editing, patch: form })
      else await api.invoke('alarms:create', form)
      toast(editing ? 'Alarm updated ⏰' : 'Alarm set ⏰')
      setForm(blank)
      setEditing(null)
    } catch {
      toast('Please check the alarm fields.')
    }
  }

  const preview = (s: Sound): void => {
    startAlarm(s, 2500)
    setTimeout(stopAlarm, 2500)
  }

  const describe = (a: Alarm): string => (a.repeat === 'custom' ? a.days.map((d) => DAY_NAMES[d]).join(', ') : a.repeat)

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_340px]">
      <Card title="Alarms">
        {alarms.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {alarms.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <label className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-sky-500"
                    checked={a.enabled}
                    onChange={(e) => void api.invoke('alarms:update', { id: a.id, patch: { enabled: e.target.checked } })}
                  />
                  <span className={a.enabled ? '' : 'opacity-50'}>
                    <span className="text-xl font-semibold tabular-nums">{a.time_hhmm}</span> <span className="font-medium">{a.label}</span>
                    <span className="block text-xs text-slate-500">
                      {describe(a)} · {a.sound} · snooze {a.snooze_min} min
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 gap-1">
                  <button
                    className={ghostBtn}
                    onClick={() => {
                      setEditing(a.id)
                      setForm({ label: a.label, time_hhmm: a.time_hhmm, repeat: a.repeat, days: a.days, sound: a.sound, snooze_min: a.snooze_min })
                    }}
                  >
                    Edit
                  </button>
                  <button className={ghostBtn} onClick={() => confirm(`Delete alarm “${a.label}”?`) && void api.invoke('alarms:delete', { id: a.id })}>
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="⏰" text="No alarms yet. Try “wake me up at 7 every weekday” in chat." />
        )}
      </Card>
      <Card title={editing ? 'Edit alarm' : 'New alarm'} className="h-fit">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label="Label">
            <input className={inputCls} required maxLength={80} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </Field>
          <Field label="Time">
            <input className={inputCls} type="time" required value={form.time_hhmm} onChange={(e) => setForm({ ...form, time_hhmm: e.target.value })} />
          </Field>
          <Field label="Repeat">
            <select className={inputCls} value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as Repeat })}>
              {REPEATS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          {form.repeat === 'custom' && (
            <div className="flex flex-wrap gap-1">
              {DAY_NAMES.map((d, i) => {
                const on = form.days.includes(i)
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== i) : [...form.days, i].sort() })}
                    className={`rounded-md px-2 py-1 text-xs ${on ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          )}
          <Field label="Sound">
            <div className="flex gap-2">
              <select className={`${inputCls} flex-1`} value={form.sound} onChange={(e) => setForm({ ...form, sound: e.target.value as Sound })}>
                {SOUNDS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'system' ? 'system default' : s}
                  </option>
                ))}
              </select>
              <button type="button" className={ghostBtn} disabled={form.sound === 'system'} onClick={() => preview(form.sound)}>
                ▶
              </button>
            </div>
          </Field>
          <Field label="Snooze length (min)">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={60}
              value={form.snooze_min}
              onChange={(e) => setForm({ ...form, snooze_min: Math.max(1, Math.min(60, Number(e.target.value) || 5)) })}
            />
          </Field>
          <div className="flex gap-2">
            <button className={primaryBtn} disabled={form.repeat === 'custom' && !form.days.length}>
              {editing ? 'Save' : 'Add alarm'}
            </button>
            {editing && (
              <button
                type="button"
                className={ghostBtn}
                onClick={() => {
                  setEditing(null)
                  setForm(blank)
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
