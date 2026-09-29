import type { SipPalApi } from '@shared/ipc'

declare global {
  interface Window {
    sippal: SipPalApi
  }
}
