import { join } from 'node:path'
import { app, nativeTheme, powerMonitor, session } from 'electron'
import { openDb } from './db'
import { bus } from './bus'
import { registerIpc } from './ipc'
import { createPetWindow, setFullscreenBusy, setPetWanted, setQuitting, showDashboard } from './windows'
import { buildTrayMenu, createTray } from './tray'
import { getSettings } from './services/settings'
import * as scheduler from './scheduler'
import { stopFullscreenWatch, watchFullscreen } from './fullscreen'

// Dev only: a separate profile (e.g. demo data for screenshots) instead of the real one.
if (!app.isPackaged && process.env.SIPPAL_USER_DATA) app.setPath('userData', process.env.SIPPAL_USER_DATA)

// Linux needs this for the transparent pet overlay.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showDashboard())
  app.on('activate', () => showDashboard()) // macOS: clicking the Dock icon
  app.whenReady().then(init)
}

function applySettings(): void {
  const s = getSettings()
  nativeTheme.themeSource = s.theme
  setPetWanted(s.petVisible)
  // --hidden: a login launch starts quietly in the tray (wasOpenedAtLogin only works on macOS).
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: ['--hidden'] })
  buildTrayMenu()
}

function init(): void {
  app.setAppUserModelId('com.sippal.app')
  openDb(join(app.getPath('userData'), 'sippal.db'))

  // Only the microphone (push-to-talk) is ever granted, and only to our own pages.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    const url = wc.getURL()
    const ours = url.startsWith('file://') || (!!process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL))
    cb(ours && permission === 'media')
  })

  registerIpc()
  createPetWindow()
  createTray()
  applySettings()
  bus.on('msg', (m) => m.type === 'changed' && m.domain === 'settings' && applySettings())

  scheduler.start()
  powerMonitor.on('suspend', scheduler.stop)
  powerMonitor.on('resume', scheduler.resume)
  watchFullscreen((busy) => setFullscreenBusy(busy && getSettings().hideInFullscreen))

  if (!process.argv.includes('--hidden')) showDashboard('today')
}

// The app lives in the tray; closing windows never quits it.
app.on('window-all-closed', () => undefined)
app.on('before-quit', () => {
  setQuitting()
  scheduler.stop()
  stopFullscreenWatch()
})
