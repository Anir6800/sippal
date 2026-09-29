import { app, Menu, nativeImage, Tray } from 'electron'
import icon from '../../resources/icon.png?asset'
import { showDashboard } from './windows'
import { getSettings, setSettings } from './services/settings'
import { logWater } from './services/water'
import { addDays, dayStart } from '@shared/time'

let tray: Tray | null = null

function pauseUntil(d: Date | null): void {
  setSettings({ pausedUntil: d ? d.toISOString() : null })
}

export function buildTrayMenu(): void {
  if (!tray) return
  const s = getSettings()
  const paused = s.pausedUntil && new Date(s.pausedUntil) > new Date()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Dashboard', click: () => showDashboard() },
      { label: 'Play a game 🎮', click: () => showDashboard('games') },
      { label: s.petVisible ? 'Hide pet' : 'Show pet', click: () => setSettings({ petVisible: !s.petVisible }) },
      { type: 'separator' },
      {
        label: 'Quick log water',
        submenu: s.cupPresets.map((ml) => ({ label: `+${ml} ml`, click: () => logWater(ml, 'tray') }))
      },
      {
        label: paused ? `Reminders paused until ${new Date(s.pausedUntil!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Pause reminders',
        submenu: [
          { label: '30 minutes', click: () => pauseUntil(new Date(Date.now() + 30 * 60_000)) },
          { label: '1 hour', click: () => pauseUntil(new Date(Date.now() + 60 * 60_000)) },
          { label: 'Until tomorrow', click: () => pauseUntil(addDays(dayStart(new Date(), s.dayResetHour), 1)) },
          { type: 'separator' },
          { label: 'Resume now', enabled: !!paused, click: () => pauseUntil(null) }
        ]
      },
      { type: 'separator' },
      { label: 'Start with Windows', type: 'checkbox', checked: s.launchAtLogin, click: () => setSettings({ launchAtLogin: !s.launchAtLogin }) },
      { label: 'Quit SipPal', click: () => app.quit() }
    ])
  )
}

export function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('SipPal')
  tray.on('click', () => showDashboard())
  buildTrayMenu()
}
