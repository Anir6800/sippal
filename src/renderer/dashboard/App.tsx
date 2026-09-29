import { useEffect, useState, type JSX } from 'react'
import { api, useStore } from '../common/store'
import { ChatView } from '../common/ChatView'
import { Toasts, ghostBtn } from './ui'
import { TodayPage } from './TodayPage'
import { HistoryPage } from './HistoryPage'
import { SchedulePage } from './SchedulePage'
import { AlarmsPage } from './AlarmsPage'
import { SettingsPage } from './SettingsPage'

const TABS = [
  ['today', '💧', 'Today'],
  ['history', '📈', 'History'],
  ['schedule', '📅', 'Schedule'],
  ['alarms', '⏰', 'Alarms'],
  ['chat', '💬', 'Chat'],
  ['settings', '⚙️', 'Settings']
] as const
type Tab = (typeof TABS)[number][0]

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('today')
  const settings = useStore((s) => s.settings)
  useEffect(() => api.onNavigate((t) => TABS.some(([id]) => id === t) && setTab(t as Tab)), [])

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-4 flex items-center gap-2 px-2 text-lg font-bold">
          <span className="text-2xl">💧</span> SipPal
        </div>
        {TABS.map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
              tab === id ? 'bg-sky-100 font-semibold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
        <div className="mt-auto px-2 text-xs text-slate-400">{settings ? `Hi, ${settings.name} 👋` : ''}</div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {tab === 'today' && <TodayPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'schedule' && <SchedulePage />}
        {tab === 'alarms' && <AlarmsPage />}
        {tab === 'chat' && (
          <div className="mx-auto flex h-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
              <span className="font-semibold">Chat with Sip</span>
              <button className={ghostBtn} onClick={() => confirm('Clear chat history?') && void api.invoke('chat:clear')}>
                Clear history
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatView />
            </div>
          </div>
        )}
        {tab === 'settings' && <SettingsPage />}
      </main>
      <Toasts />
    </div>
  )
}
