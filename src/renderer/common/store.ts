import { create } from 'zustand'
import type { PublicSettings } from '@shared/ipc'
import type { Alarm, CalEvent, ChatMessage, Domain, WaterToday } from '@shared/types'

export const api = window.sippal

interface State {
  settings: PublicSettings | null
  today: WaterToday | null
  events: CalEvent[]
  alarms: Alarm[]
  chat: ChatMessage[]
}

export const useStore = create<State>(() => ({ settings: null, today: null, events: [], alarms: [], chat: [] }))

const loaders: Record<Domain, () => Promise<unknown>> = {
  settings: async () => useStore.setState({ settings: await api.invoke('settings:get') }),
  water: async () => useStore.setState({ today: await api.invoke('water:today') }),
  events: async () => useStore.setState({ events: await api.invoke('events:list') }),
  alarms: async () => useStore.setState({ alarms: await api.invoke('alarms:list') }),
  chat: async () => useStore.setState({ chat: await api.invoke('chat:list') })
}

/** Load the given domains and refetch each one whenever main broadcasts that it changed. */
export function initStore(domains: Domain[]): () => void {
  domains.forEach((d) => void loaders[d]())
  return api.on((m) => {
    if (m.type !== 'changed' || !domains.includes(m.domain)) return
    void loaders[m.domain]()
    // Goal / day-reset settings change today's numbers too.
    if (m.domain === 'settings' && domains.includes('water')) void loaders.water()
  })
}
