import { readFileSync, writeFileSync } from 'node:fs'
import { BrowserWindow, dialog, ipcMain, Menu, type IpcMainInvokeEvent } from 'electron'
import { requests, type Channel, type PublicSettings, type Responses } from '@shared/ipc'
import { effectiveGoal } from '@shared/water'
import { z } from 'zod'
import { getSettings, setSettings } from './services/settings'
import { deleteLog, history, logWater, today } from './services/water'
import { createEvent, deleteEvent, listEvents, updateEvent } from './services/events'
import { createAlarm, deleteAlarm, listAlarms, updateAlarm } from './services/alarms'
import { clearChat, logReminder, recentMessages } from './services/chat'
import { exportAll, importAll, notifyAll, wipe } from './services/data'
import { hasApiKey, setApiKey } from './secret'
import { confirmPending, sendMessage, testKey, transcribe } from './ai/assistant'
import { respondAlarm, snoozeWater, waterNotification } from './scheduler'
import { focusPet, markPetReady, setHitRects, setPetHold, setTrackCursor, showDashboard } from './windows'

const publicSettings = (): PublicSettings => {
  const s = getSettings()
  return { ...s, hasApiKey: hasApiKey(), effectiveGoalMl: effectiveGoal(s) }
}

type Handlers = {
  [C in Channel]: (p: z.output<(typeof requests)[C]>, e: IpcMainInvokeEvent) => Responses[C] | Promise<Responses[C]>
}

const handlers: Handlers = {
  'settings:get': publicSettings,
  'settings:set': (p) => (setSettings(p), publicSettings()),
  'water:today': () => today(),
  'water:log': (p) => ({ id: logWater(p.amount_ml, p.source) }),
  'water:delete': (p) => deleteLog(p.id),
  'water:history': (p) => history(p.days),
  'water:snooze': (p) => snoozeWater(p.minutes),
  'events:list': () => listEvents(),
  'events:create': (p) => createEvent(p),
  'events:update': (p) => updateEvent(p.id, p.patch),
  'events:delete': (p) => void deleteEvent(p.id),
  'alarms:list': () => listAlarms(),
  'alarms:create': (p) => createAlarm(p),
  'alarms:update': (p) => updateAlarm(p.id, p.patch),
  'alarms:delete': (p) => void deleteAlarm(p.id),
  'alarm:respond': (p) => respondAlarm(p.id, p.action),
  'chat:list': () => recentMessages(),
  'chat:clear': () => clearChat(),
  'ai:send': (p) => sendMessage(p.text),
  'ai:confirm': (p) => confirmPending(p.id, p.accept),
  'ai:transcribe': (p) => transcribe(p.wavBase64),
  'ai:setKey': (p) => {
    setApiKey(p.key)
    notifyAll()
  },
  'ai:testKey': () => testKey(),
  'pet:ready': () => markPetReady(),
  'pet:hold': (p) => setPetHold(p),
  'pet:hitRects': (p) => setHitRects(p),
  'pet:trackCursor': (p) => setTrackCursor(p),
  'pet:focus': (p) => focusPet(p),
  'pet:contextMenu': (_p, e) => {
    const s = getSettings()
    Menu.buildFromTemplate([
      { label: `Log ${s.defaultCupMl} ml`, click: () => logWater(s.defaultCupMl, 'pet') },
      { label: 'Log…', submenu: s.cupPresets.map((ml) => ({ label: `${ml} ml`, click: () => logWater(ml, 'pet') })) },
      { label: 'Snooze reminders', submenu: [10, 30, 60].map((m) => ({ label: `${m} min`, click: () => snoozeWater(m) })) },
      { type: 'separator' },
      { label: 'Open dashboard', click: () => showDashboard() },
      { label: 'Hide pet', click: () => setSettings({ petVisible: false }) }
    ]).popup({ window: BrowserWindow.fromWebContents(e.sender) ?? undefined })
  },
  'pet:thirstyIgnored': (p) => {
    logReminder('water', null, 'missed')
    // Back the pet up with a quiet system notification once it's been ignored a while.
    if (p.level === 2) waterNotification('Still thirsty over here 💧', true)
  },
  'app:openDashboard': (p) => showDashboard(p),
  'data:export': async () => {
    const r = await dialog.showSaveDialog({ defaultPath: `sippal-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled || !r.filePath) return { ok: false, message: 'Export cancelled.' }
    writeFileSync(r.filePath, exportAll())
    return { ok: true, message: `Exported to ${r.filePath}` }
  },
  'data:import': async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled || !r.filePaths[0]) return { ok: false, message: 'Import cancelled.' }
    try {
      importAll(readFileSync(r.filePaths[0], 'utf8'))
      return { ok: true, message: 'Data imported.' }
    } catch (e) {
      return { ok: false, message: `Import failed: ${e instanceof Error ? e.message.slice(0, 300) : e}` }
    }
  },
  'data:reset': async (_p, e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      type: 'warning' as const,
      buttons: ['Cancel', 'Delete everything'],
      defaultId: 0,
      cancelId: 0,
      message: 'Reset all SipPal data?',
      detail: 'Water logs, events, alarms, chat history, settings and the API key will be permanently deleted.'
    }
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    if (r.response !== 1) return { ok: false, message: 'Reset cancelled.' }
    wipe(true)
    notifyAll()
    return { ok: true, message: 'All data deleted.' }
  }
}

export function registerIpc(): void {
  ipcMain.handle('sippal', async (e, channel: unknown, payload: unknown) => {
    if (typeof channel !== 'string' || !Object.hasOwn(requests, channel)) throw new Error('Unknown IPC channel')
    const c = channel as Channel
    const parsed = (requests[c] as z.ZodType).safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload for ${c}: ${z.prettifyError(parsed.error)}`)
    return (handlers[c] as (p: unknown, e: IpcMainInvokeEvent) => unknown)(parsed.data, e)
  })
}
