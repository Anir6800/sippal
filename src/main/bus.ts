import { EventEmitter } from 'node:events'
import type { BusMsg, Domain, PetCue } from '@shared/types'

/** Central event bus. Services emit here; windows.ts forwards to renderers, scheduler replans. */
export const bus = new EventEmitter<{ msg: [BusMsg] }>()

export const changed = (domain: Domain): boolean => bus.emit('msg', { type: 'changed', domain })
export const petCue = (cue: PetCue): boolean => bus.emit('msg', { type: 'pet', cue })
