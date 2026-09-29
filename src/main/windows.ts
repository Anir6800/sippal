import { join } from 'node:path'
import { BrowserWindow, screen, shell } from 'electron'
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
 * Work area minus 1px: a topmost window that exactly covers the monitor (e.g. with an auto-hidden
 * taskbar) makes Windows report "full-screen app running", which would make us hide ourselves.
 */
const overlayBounds = (): Electron.Rectangle => {
  const wa = screen.getPrimaryDisplay().workArea
  return { ...wa, height: wa.height - 1 }
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
  pet.setIgnoreMouseEvents(true, { forward: true })
  pet.once('ready-to-show', applyPetVisibility)
  pet.on('blur', () => sendTo(pet, { type: 'pet', cue: { kind: 'blur' } }))
  const fit = (): void => pet?.setBounds(overlayBounds())
  screen.on('display-metrics-changed', fit)
  screen.on('display-added', fit)
  screen.on('display-removed', fit)
  load(pet, 'pet')
  return pet
}

export function setPetClickable(clickable: boolean): void {
  pet?.setIgnoreMouseEvents(!clickable, { forward: true })
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

bus.on('msg', (msg) => {
  sendTo(pet, msg)
  if (msg.type === 'changed') sendTo(dash, msg)
})
