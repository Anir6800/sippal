import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { api, useStore } from '../common/store'
import { Card, Field, ghostBtn, inputCls, primaryBtn, toast } from './ui'
import { PET_THEMES } from '@shared/constants'
import type { Settings } from '@shared/settings'
import { goalFromWeight } from '@shared/water'

type Draft = Omit<Settings, 'snoozedUntil' | 'pausedUntil'>

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input type="checkbox" className="h-5 w-5 accent-sky-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const Grid = ({ children }: { children: ReactNode }): JSX.Element => <div className="grid gap-3 sm:grid-cols-2">{children}</div>

export function SettingsPage(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const [d, setD] = useState<Draft | null>(null)
  const [cups, setCups] = useState('')
  const [key, setKey] = useState('')
  const [keyMsg, setKeyMsg] = useState('')

  useEffect(() => {
    if (!settings) return
    const { snoozedUntil: _s, pausedUntil: _p, hasApiKey: _h, effectiveGoalMl: _e, ...rest } = settings
    setD(rest)
    setCups(rest.cupPresets.join(', '))
  }, [settings])

  if (!d || !settings) return <p className="text-slate-400">Loading…</p>
  const up = <K extends keyof Draft>(k: K, v: Draft[K]): void => setD({ ...d, [k]: v })
  const num = <K extends keyof Draft>(k: K) => (e: { target: { value: string } }) => up(k, Number(e.target.value) as Draft[K])

  async function save(): Promise<void> {
    const cupPresets = cups
      .split(',')
      .map((s) => Math.round(Number(s.trim())))
      .filter((n) => n > 0)
    try {
      await api.invoke('settings:set', { ...d!, cupPresets })
      toast('Settings saved ✅')
    } catch (e) {
      toast(`Couldn't save: ${String(e).split('\n').slice(-2).join(' ').slice(0, 160)}`)
    }
  }

  async function saveKey(): Promise<void> {
    await api.invoke('ai:setKey', { key })
    setKey('')
    setKeyMsg(key ? 'Key saved (encrypted). Testing…' : 'Key removed.')
    if (key) setKeyMsg((await api.invoke('ai:testKey')).message)
  }

  const data = async (ch: 'data:export' | 'data:import' | 'data:reset'): Promise<void> => toast((await api.invoke(ch)).message)

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-20">
      <Card title="Profile">
        <Grid>
          <Field label="Name">
            <input className={inputCls} value={d.name} maxLength={40} onChange={(e) => up('name', e.target.value)} />
          </Field>
          <Field label="Weight (kg)" hint="Used for the automatic goal (≈33 ml per kg)">
            <input
              className={inputCls}
              type="number"
              min={20}
              max={300}
              value={d.weightKg ?? ''}
              onChange={(e) => up('weightKg', e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Grid>
      </Card>

      <Card title="Water">
        <Grid>
          <Field label="Goal mode">
            <select className={inputCls} value={d.goalMode} onChange={(e) => up('goalMode', e.target.value as Draft['goalMode'])}>
              <option value="manual">Manual</option>
              <option value="weight">From body weight</option>
            </select>
          </Field>
          {d.goalMode === 'manual' ? (
            <Field label="Daily goal (ml)">
              <input className={inputCls} type="number" min={500} max={10000} step={50} value={d.goalMl} onChange={num('goalMl')} />
            </Field>
          ) : (
            <Field label="Calculated goal">
              <div className="py-1.5 text-sm">{d.weightKg ? `${goalFromWeight(d.weightKg)} ml` : 'Enter your weight above'}</div>
            </Field>
          )}
          <Field label="Cup presets (ml)" hint="Comma-separated, up to 6">
            <input className={inputCls} value={cups} onChange={(e) => setCups(e.target.value)} />
          </Field>
          <Field label="Default cup (ml)" hint="Used by double-click and notifications">
            <input className={inputCls} type="number" min={10} max={3000} value={d.defaultCupMl} onChange={num('defaultCupMl')} />
          </Field>
          <Field label="Reminder interval (min)">
            <input className={inputCls} type="number" min={5} max={600} value={d.reminderIntervalMin} onChange={num('reminderIntervalMin')} />
          </Field>
          <Field label="Escalate after ignoring (min)">
            <input className={inputCls} type="number" min={1} max={120} value={d.escalationDelayMin} onChange={num('escalationDelayMin')} />
          </Field>
          <Field label="Active from">
            <input className={inputCls} type="time" value={d.activeStart} onChange={(e) => up('activeStart', e.target.value)} />
          </Field>
          <Field label="Active until">
            <input className={inputCls} type="time" value={d.activeEnd} onChange={(e) => up('activeEnd', e.target.value)} />
          </Field>
          <Field label="New day starts at (hour)" hint="For night owls: logs before this hour count for the previous day">
            <input className={inputCls} type="number" min={0} max={23} value={d.dayResetHour} onChange={num('dayResetHour')} />
          </Field>
          <div className="self-center">
            <Toggle label="Keep reminding after goal" checked={d.keepReminding} onChange={(v) => up('keepReminding', v)} />
          </div>
        </Grid>
      </Card>

      <Card title="Pet">
        <Grid>
          <Toggle label="Show pet" checked={d.petVisible} onChange={(v) => up('petVisible', v)} />
          <Toggle label="Walks around" checked={d.petMovement} onChange={(v) => up('petMovement', v)} />
          <Toggle label="Pet sounds" checked={d.petSounds} onChange={(v) => up('petSounds', v)} />
          <Toggle label="Hide during full-screen apps / meetings" checked={d.hideInFullscreen} onChange={(v) => up('hideInFullscreen', v)} />
          <Field label={`Size: ${d.petSize}px`}>
            <input type="range" min={60} max={160} value={d.petSize} onChange={num('petSize')} className="accent-sky-500" />
          </Field>
          <Field label="Colour">
            <div className="flex gap-2">
              {PET_THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => up('petTheme', t)}
                  className={`rounded-lg px-2.5 py-1 text-xs capitalize ${d.petTheme === t ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Quiet hours from" hint="The pet sleeps">
            <input className={inputCls} type="time" value={d.quietStart} onChange={(e) => up('quietStart', e.target.value)} />
          </Field>
          <Field label="Quiet hours until">
            <input className={inputCls} type="time" value={d.quietEnd} onChange={(e) => up('quietEnd', e.target.value)} />
          </Field>
        </Grid>
      </Card>

      <Card title="AI assistant">
        <div className="space-y-3">
          <Field label={`Gemini API key ${settings.hasApiKey ? '· saved 🔒' : '· not set'}`} hint="Stored encrypted with your OS account. It never leaves the app's main process.">
            <div className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                type="password"
                autoComplete="off"
                placeholder={settings.hasApiKey ? '••••••••••••  (enter a new key to replace)' : 'Paste your key'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <button type="button" className={primaryBtn} disabled={!key.trim()} onClick={() => void saveKey()}>
                Save key
              </button>
              <button
                type="button"
                className={ghostBtn}
                disabled={!settings.hasApiKey}
                onClick={async () => setKeyMsg((await api.invoke('ai:testKey')).message)}
              >
                Test key
              </button>
            </div>
          </Field>
          {keyMsg && <p className="text-sm">{keyMsg}</p>}
          {settings.hasApiKey && (
            <button type="button" className="text-xs text-rose-500 underline" onClick={() => void api.invoke('ai:setKey', { key: '' }).then(() => setKeyMsg('Key removed.'))}>
              Remove saved key
            </button>
          )}
          <Grid>
            <Field label="Model" hint="Any Gemini model id, e.g. gemini-3.8-flash">
              <input className={inputCls} value={d.model} onChange={(e) => up('model', e.target.value)} />
            </Field>
            <Field label="History sent (messages)">
              <input className={inputCls} type="number" min={0} max={100} value={d.historyTurns} onChange={num('historyTurns')} />
            </Field>
            <Toggle label="Read replies aloud (TTS)" checked={d.tts} onChange={(v) => up('tts', v)} />
            <Toggle label="Voice input (mic button)" checked={d.voiceInput} onChange={(v) => up('voiceInput', v)} />
          </Grid>
        </div>
      </Card>

      <Card title="General">
        <Grid>
          <Toggle label="Launch at login" checked={d.launchAtLogin} onChange={(v) => up('launchAtLogin', v)} />
          <Toggle label="Notification sound" checked={d.notificationSound} onChange={(v) => up('notificationSound', v)} />
          <Field label="Theme">
            <select className={inputCls} value={d.theme} onChange={(e) => up('theme', e.target.value as Draft['theme'])}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
        </Grid>
      </Card>

      <Card title="Data">
        <div className="flex flex-wrap gap-2">
          <button className={ghostBtn} onClick={() => void data('data:export')}>
            Export JSON
          </button>
          <button className={ghostBtn} onClick={() => void data('data:import')}>
            Import JSON
          </button>
          <button className={`${ghostBtn} text-rose-600`} onClick={() => void data('data:reset')}>
            Reset all data…
          </button>
        </div>
      </Card>

      <div className="fixed right-6 bottom-6">
        <button className={`${primaryBtn} px-6 py-2.5 shadow-lg`} onClick={() => void save()}>
          Save settings
        </button>
      </div>
    </div>
  )
}
