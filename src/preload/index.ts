import { contextBridge, ipcRenderer } from 'electron'
import type { SipPalApi } from '@shared/ipc'
import type { BusMsg } from '@shared/types'

// Minimal surface: one validated request channel plus two event streams. Main does all validation.
const api: SipPalApi = {
  invoke: ((channel: string, payload?: unknown) => ipcRenderer.invoke('sippal', channel, payload)) as SipPalApi['invoke'],
  on(listener) {
    const h = (_: unknown, msg: BusMsg): void => listener(msg)
    ipcRenderer.on('bus', h)
    return () => void ipcRenderer.off('bus', h)
  },
  onNavigate(listener) {
    const h = (_: unknown, tab: string): void => listener(tab)
    ipcRenderer.on('navigate', h)
    return () => void ipcRenderer.off('navigate', h)
  }
}

contextBridge.exposeInMainWorld('sippal', api)
