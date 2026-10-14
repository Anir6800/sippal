import { join } from 'node:path'
import { BrowserWindow, powerMonitor, screen, shell } from 'electron'
import { bus } from './bus'
import icon from '../../resources/icon.png?asset'
import type { BusMsg } from '@shared/types'

let pet: BrowserWindow | null = null
let dash: BrowserWindow | null = null
let quitting = false
let petWanted = true // user setting
let fullscreenBusy = false // another app is full-screen / in a meeting

export const setQuitting = (): void => void (quitting = true)

const webPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
}

function load(win: BrowserWindow, page: 'pet' | 'dashboard'): void {
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}.html`)
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`))
  if (process.env.SIPPAL_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })
  // Never navigate away from our own pages; open real links in the browser.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
}

/**
 * The overlay covers only the bottom ~60% of the work area (min 560 px: pet + chat panel), never the
 * whole monitor. A topmost window that covers the screen makes Windows believe a full-screen app is
 * running (SHQueryUserNotificationState flips to "busy"); with an auto-hidden taskbar the taskbar then
 * stays hidden and every app looks full-screen. Shrinking the overlay by 1 px was not enough.
 */
const overlayBounds = (): Electron.Rectangle => {
  const wa = screen.getPrimaryDisplay().workArea
  const height = Math.min(wa.height, Math.max(560, Math.round(wa.height * 0.6)))
  return { x: wa.x, y: wa.y + wa.height - height, width: wa.width, height }
}

export function createPetWindow(): BrowserWindow {
  pet = new BrowserWindow({
    ...overlayBounds(),
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    // "toolbar" keeps the overlay out of Alt+Tab on Windows.
    type: process.platform === 'win32' ? 'toolbar' : undefined,
    webPreferences: { ...webPreferences, backgroundThrottling: false }
  })
  pet.setAlwaysOnTop(true, 'screen-saver')
  pet.setVisibleOnAllWorkspaces(true)
  pet.setIgnoreMouseEvents(true)
  const poll = setInterval(pollCursor, 100)
  // On quit the window is destroyed first; stop everything that would still touch it.
  pet.on('closed', () => {
    clearInterval(poll)
    pet = null
  })
  pet.once('ready-to-show', applyPetVisibility)
  const fit = (): void => pet?.setBounds(overlayBounds())
  screen.on('display-metrics-changed', fit)
  screen.on('display-added', fit)
  screen.on('display-removed', fit)
  pet.webContents.on('did-start-loading', () => (petReady = false))
  load(pet, 'pet')
  return pet
}

// ---------- click-through ----------
/*
 * The overlay ignores the mouse except over the pet and its bubbles. Main polls the cursor at
 * 10 Hz against rectangles the renderer reports. (Using setIgnoreMouseEvents' `forward` option
 * instead delivers every mouse move on the desktop to the overlay, and each one recomposites the
 * full-screen transparent window — ~15% of a core while you use the mouse.)
 */
export interface HitRect {
  x: number
  y: number
  w: number
  h: number
}
let hitRects: HitRect[] = []
let hold = false // renderer holds clickability during a drag
let clickable = false
let trackCursor = false
let polls = 0

export const setHitRects = (r: HitRect[]): void => void (hitRects = r)
export const setPetHold = (v: boolean): void => void (hold = v)
export const setTrackCursor = (v: boolean): void => void (trackCursor = v)

function pollCursor(): void {
  if (!pet || !pet.isVisible()) return
  const c = screen.getCursorScreenPoint()
  const b = pet.getBounds()
  const x = c.x - b.x
  const y = c.y - b.y
  const inside = hold || hitRects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  if (inside !== clickable) pet.setIgnoreMouseEvents(!(clickable = inside))
  if (trackCursor) sendTo(pet, { type: 'pet', cue: { kind: 'cursor', x, y } })
  // Every 10 s tell the pet how long the user has been idle (keyboard + mouse), for SLEEP.
  if (++polls % 100 === 0) sendTo(pet, { type: 'pet', cue: { kind: 'idle', seconds: powerMonitor.getSystemIdleTime() } })
}

export function focusPet(focus: boolean): void {
  if (!pet) return
  if (focus) pet.focus()
  else pet.blur()
}

export function setPetWanted(v: boolean): void {
  petWanted = v
  applyPetVisibility()
}

export function setFullscreenBusy(v: boolean): void {
  // Our own overlay counts as foreground while the chat bubble is focused; ignore that case.
  if (v && pet?.isFocused()) return
  fullscreenBusy = v
  applyPetVisibility()
}

/** True when the pet is on screen and can deliver a reminder itself. */
export const petAvailable = (): boolean => !!pet && petWanted && !fullscreenBusy

function applyPetVisibility(): void {
  if (!pet) return
  const show = petAvailable()
  if (show && !pet.isVisible()) pet.showInactive()
  if (!show && pet.isVisible()) pet.hide()
  sendTo(pet, { type: 'pet', cue: { kind: 'hidden', hidden: !show } })
}

export function showDashboard(tab?: string): void {
  if (!dash || dash.isDestroyed()) {
    dash = new BrowserWindow({
      width: 1040,
      height: 740,
      minWidth: 760,
      minHeight: 560,
      show: false,
      title: 'SipPal',
      icon,
      autoHideMenuBar: true,
      webPreferences
    })
    dash.on('close', (e) => {
      if (quitting) return
      e.preventDefault()
      dash?.hide()
    })
    load(dash, 'dashboard')
    dash.once('ready-to-show', () => {
      dash?.show()
      if (tab) dash?.webContents.send('navigate', tab)
    })
    return
  }
  if (dash.isMinimized()) dash.restore()
  dash.show()
  dash.focus()
  if (tab) dash.webContents.send('navigate', tab)
}

function sendTo(win: BrowserWindow | null, msg: BusMsg): void {
  if (win && !win.isDestroyed()) win.webContents.send('bus', msg)
}

// Pet cues emitted before the pet UI has subscribed (e.g. the startup "You missed…") are queued.
let petReady = false
const queued: BusMsg[] = []

export function markPetReady(): void {
  petReady = true
  queued.splice(0).forEach((m) => sendTo(pet, m))
}

bus.on('msg', (msg) => {
  if (msg.type === 'open') return showDashboard(msg.tab)
  if (petReady || msg.type === 'changed') sendTo(pet, msg)
  else queued.push(msg)
  if (msg.type === 'changed') sendTo(dash, msg)
})
