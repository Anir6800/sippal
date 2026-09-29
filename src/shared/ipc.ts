import { z } from 'zod'
import { SettingsPatch, type Settings } from './settings'
import {
  AlarmInput,
  AlarmPatch,
  EventInput,
  EventPatch,
  WATER_SOURCES,
  type Alarm,
  type CalEvent,
  type ChatMessage,
  type ChatReply,
  type DayTotal,
  type WaterToday
} from './types'

const none = z.undefined()
const id = z.number().int().positive()

/** Every renderer → main request. Main rejects unknown channels and payloads that fail these schemas. */
export const requests = {
  'settings:get': none,
  'settings:set': SettingsPatch,
  'water:today': none,
  'water:log': z.object({ amount_ml: z.number().int().min(10).max(3000), source: z.enum(WATER_SOURCES) }),
  'water:delete': z.object({ id }),
  'water:history': z.object({ days: z.number().int().min(1).max(366) }),
  'water:snooze': z.object({ minutes: z.number().int().min(1).max(24 * 60) }),
  'events:list': none,
  'events:create': EventInput,
  'events:update': z.object({ id, patch: EventPatch }),
  'events:delete': z.object({ id }),
  'alarms:list': none,
  'alarms:create': AlarmInput,
  'alarms:update': z.object({ id, patch: AlarmPatch }),
  'alarms:delete': z.object({ id }),
  'alarm:respond': z.object({ id, action: z.enum(['dismiss', 'snooze']) }),
  'chat:list': none,
  'chat:clear': none,
  'ai:send': z.object({ text: z.string().trim().min(1).max(4000) }),
  'ai:confirm': z.object({ id: z.string().max(64), accept: z.boolean() }),
  'ai:transcribe': z.object({ wavBase64: z.string().min(1).max(8_000_000) }),
  'ai:setKey': z.object({ key: z.string().trim().max(200) }),
  'ai:testKey': none,
  'pet:clickable': z.boolean(),
  'pet:focus': z.boolean(),
  'pet:contextMenu': none,
  'pet:thirstyIgnored': z.object({ level: z.number().int().min(0).max(10) }),
  'app:openDashboard': z.enum(['today', 'history', 'schedule', 'alarms', 'chat', 'settings']).optional(),
  'data:export': none,
  'data:import': none,
  'data:reset': none
} satisfies Record<string, z.ZodType>

export type Channel = keyof typeof requests
export type Req<C extends Channel> = z.input<(typeof requests)[C]>

export interface PublicSettings extends Settings {
  hasApiKey: boolean
  effectiveGoalMl: number
}

export interface Responses {
  'settings:get': PublicSettings
  'settings:set': PublicSettings
  'water:today': WaterToday
  'water:log': { id: number }
  'water:delete': void
  'water:history': DayTotal[]
  'water:snooze': void
  'events:list': CalEvent[]
  'events:create': CalEvent
  'events:update': CalEvent
  'events:delete': void
  'alarms:list': Alarm[]
  'alarms:create': Alarm
  'alarms:update': Alarm
  'alarms:delete': void
  'alarm:respond': void
  'chat:list': ChatMessage[]
  'chat:clear': void
  'ai:send': ChatReply
  'ai:confirm': ChatReply
  'ai:transcribe': { ok: true; text: string } | { ok: false; message: string }
  'ai:setKey': void
  'ai:testKey': { ok: boolean; message: string }
  'pet:clickable': void
  'pet:focus': void
  'pet:contextMenu': void
  'pet:thirstyIgnored': void
  'app:openDashboard': void
  'data:export': { ok: boolean; message: string }
  'data:import': { ok: boolean; message: string }
  'data:reset': { ok: boolean; message: string }
}

export interface SipPalApi {
  invoke<C extends Channel>(channel: C, ...payload: Req<C> extends undefined ? [] : [Req<C>]): Promise<Responses[C]>
  on(listener: (msg: import('./types').BusMsg) => void): () => void
  onNavigate(listener: (tab: string) => void): () => void
}
