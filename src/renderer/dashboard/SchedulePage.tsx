import { useState, type JSX } from 'react'
import { api, useStore } from '../common/store'
import { Card, Empty, Field, ghostBtn, inputCls, primaryBtn, toast } from './ui'
import { RECURRENCES } from '@shared/constants'
import type { CalEvent, Recurrence } from '@shared/types'
import { occurrences } from '@shared/schedule'
import { addDays, toLocalIso } from '@shared/time'

const blank = { title: '', start: '', end: '', remind: '10', recurrence: 'none' as Recurrence, description: '' }
const toInput = (iso: string | null): string => (iso ? toLocalIso(new Date(iso)).slice(0, 16) : '')

/** Next occurrence for recurring events, the start itself otherwise. */
function nextStart(e: CalEvent, now: Date): Date {
  return occurrences(e, now, addDays(now, 8))[0] ?? new Date(e.start_at)
}

export function SchedulePage(): JSX.Element {
  const events = useStore((s) => s.events)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<number | null>(null)
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const now = new Date()
  const rows = events.map((e) => ({ e, next: nextStart(e, now) })).sort((a, b) => a.next.getTime() - b.next.getTime())
  const upcoming = rows.filter((r) => r.next >= now || r.e.recurrence !== 'none')
  const past = rows.filter((r) => !upcoming.includes(r)).reverse().slice(0, 20)

  async function submit(): Promise<void> {
    const remind = form.remind
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
    const payload = {
      title: form.title,
      start_at: toLocalIso(new Date(form.start)),
      end_at: form.end ? toLocalIso(new Date(form.end)) : null,
      remind_before: remind,
      recurrence: form.recurrence,
      description: form.description || null
    }
    try {
      if (editing) await api.invoke('events:update', { id: editing, patch: payload })
      else await api.invoke('events:create', payload)
      toast(editing ? 'Event updated ✏️' : 'Event added 📅')
      setForm(blank)
      setEditing(null)
    } catch {
      toast('Please check the fields — reminders must be whole minutes like "10, 0".')
    }
  }

  function edit(e: CalEvent): void {
    setEditing(e.id)
    setForm({
      title: e.title,
      start: toInput(e.start_at),
      end: toInput(e.end_at),
      remind: e.remind_before.join(', '),
      recurrence: e.recurrence,
      description: e.description ?? ''
    })
  }

  const row = ({ e, next }: { e: CalEvent; next: Date }): JSX.Element => (
    <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate font-medium">
          {e.title}
          {e.created_via === 'ai' && <span className="ml-2 rounded bg-violet-100 px-1.5 text-xs text-violet-700 dark:bg-violet-900 dark:text-violet-200">AI</span>}
          {e.status !== 'active' && <span className="ml-2 text-xs text-slate-400">({e.status})</span>}
        </div>
        <div className="text-xs text-slate-500">
          {next.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          {e.recurrence !== 'none' && ` · repeats ${e.recurrence}`} · remind {e.remind_before.join(', ') || '—'} min before
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button className={ghostBtn} onClick={() => edit(e)}>
          Edit
        </button>
        <button className={ghostBtn} onClick={() => confirm(`Delete “${e.title}”?`) && void api.invoke('events:delete', { id: e.id })}>
          🗑
        </button>
      </div>
    </li>
  )

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card title="Upcoming">
          {upcoming.length ? <ul className="divide-y divide-slate-100 dark:divide-slate-700">{upcoming.map(row)}</ul> : <Empty icon="📅" text="No upcoming events. Add one, or just tell Sip!" />}
        </Card>
        {past.length > 0 && (
          <Card title="Past">
            <ul className="divide-y divide-slate-100 opacity-70 dark:divide-slate-700">{past.map(row)}</ul>
          </Card>
        )}
      </div>
      <Card title={editing ? 'Edit event' : 'New event'} className="h-fit">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label="Title">
            <input className={inputCls} required maxLength={120} value={form.title} onChange={set('title')} />
          </Field>
          <Field label="Starts">
            <input className={inputCls} type="datetime-local" required value={form.start} onChange={set('start')} />
          </Field>
          <Field label="Ends (optional)">
            <input className={inputCls} type="datetime-local" value={form.end} onChange={set('end')} />
          </Field>
          <Field label="Remind before (minutes)" hint="Comma-separated, e.g. 10, 0">
            <input className={inputCls} value={form.remind} onChange={set('remind')} />
          </Field>
          <Field label="Repeat">
            <select className={inputCls} value={form.recurrence} onChange={set('recurrence')}>
              {RECURRENCES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea className={inputCls} rows={2} maxLength={1000} value={form.description} onChange={set('description')} />
          </Field>
          <div className="flex gap-2">
            <button className={primaryBtn}>{editing ? 'Save' : 'Add event'}</button>
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
