import type { SipPalApi } from '@shared/ipc'

declare global {
  interface Window {
    sippal: SipPalApi
  }
}

declare global {
  const __APP_VERSION__: string
}
