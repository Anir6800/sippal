import type { Settings } from './settings'

export function goalFromWeight(kg: number): number {
  return Math.round((kg * 33) / 50) * 50
}

export function effectiveGoal(s: Pick<Settings, 'goalMode' | 'weightKg' | 'goalMl'>): number {
  return s.goalMode === 'weight' && s.weightKg ? goalFromWeight(s.weightKg) : s.goalMl
}

/** Consecutive days meeting the goal, counting back from today (or yesterday if today isn't met yet). */
export function streak(totals: Map<string, number>, dayKeys: string[], goal: number): number {
  // dayKeys: newest first, starting with today.
  let i = (totals.get(dayKeys[0]) ?? 0) >= goal ? 0 : 1
  let n = 0
  for (; i < dayKeys.length && (totals.get(dayKeys[i]) ?? 0) >= goal; i++) n++
  return n
}

export const THIRSTY_LINES = [
  'Time to drink water! 💧',
  'Sip sip hooray? A glass would be lovely 💦',
  'Your cells are sending a tiny memo: water please 📝',
  'Hydration break! Your future self says thanks 🙌',
  "I'm a droplet and even I'm thirsty 🥤",
  'Quick sip? It takes five seconds ⏱️',
  'Water o\'clock! 🕒💧',
  'A little water keeps the headaches away 🌿',
  'Refill time, champ! 🏆',
  'Psst… your glass misses you 🥛',
  'Stay fresh — grab some water 🌊',
  'Brain fuel incoming? Drink up! 🧠💧'
]

export const ESCALATE_LINES = [
  'Hey! Still waiting on that sip 👀',
  'Pretty please? Just one glass 🥺',
  'Okay, I\'m doing the thirsty dance now 💃💧'
]
