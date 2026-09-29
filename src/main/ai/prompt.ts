import type { Alarm, CalEvent } from '@shared/types'
import { addDays, timezoneInfo, toLocalIso } from '@shared/time'
import { occurrences } from '@shared/schedule'

export interface PromptContext {
  now: Date
  name: string
  events: CalEvent[]
  alarms: Alarm[]
  water: { totalMl: number; goalMl: number; defaultCupMl: number; intervalMin: number }
}

const fmt = (d: Date): string =>
  d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

/** Rebuilt on every request so "now", the schedule and water progress are always current. */
export function buildSystemPrompt(c: PromptContext): string {
  const tz = timezoneInfo(c.now)
  const upcoming = c.events
    .filter((e) => e.status === 'active')
    .flatMap((e) => occurrences(e, addDays(c.now, -1), addDays(c.now, 14)).slice(0, 1).map((start) => ({ e, start })))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 25)
    .map(({ e, start }) => `- #${e.id} | ${e.title} | ${fmt(start)} (${toLocalIso(start)}) | remind ${JSON.stringify(e.remind_before)} min before | ${e.recurrence}`)
  const alarms = c.alarms.map(
    (a) => `- #${a.id} | ${a.label} | ${a.time_hhmm} | ${a.repeat}${a.repeat === 'custom' ? ` ${JSON.stringify(a.days)}` : ''} | ${a.enabled ? 'on' : 'off'}`
  )

  return `You are Sip, a cheerful little water-droplet desktop pet and personal assistant for ${c.name}.
You manage their water intake, alarms and schedule by calling tools. Replies appear in a small speech bubble.

NOW: ${c.now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${c.now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} local time.
Current ISO: ${toLocalIso(c.now)}
Timezone: ${tz.name} (UTC${tz.offset})

WATER TODAY: ${c.water.totalMl} / ${c.water.goalMl} ml. Default cup ${c.water.defaultCupMl} ml. Reminder every ${c.water.intervalMin} min.

EVENTS (id | title | next start | reminders | recurrence):
${upcoming.join('\n') || '- none'}

ALARMS (id | label | time | repeat | enabled):
${alarms.join('\n') || '- none'}

RULES:
- Convert every relative date/time ("tomorrow", "next Monday", "in 2 hours", "at 6") into an absolute ISO 8601 datetime with the offset ${tz.offset}.
- A bare hour without am/pm for an event (e.g. "at 6") means the next upcoming time with that clock hour between 07:00 and 22:59: today if still in the future, otherwise tomorrow. Example: at 16:05, "at 6" = today 18:00. For wake-up alarms, a bare hour means AM. If two readings are genuinely plausible, ask one short question instead of guessing.
- Never invent ids. Use ids listed above or returned by list_events / list_alarms. Call list_events for dates beyond the list above.
- Deleting or cancelling needs the user's confirmation: call the delete tool, then tell them to press Confirm. Never say it is already deleted.
- For "cancel all X on <day>": list_events for that day, then call delete_event once per matching id.
- To add a reminder to an existing event, call update_event with the full remind_before_minutes list.
- Water sizes: glass ≈ 250 ml, bottle ≈ 500 ml, cup = default cup. If the amount is truly unclear, ask.
- Only claim an action happened if its tool returned ok. If a tool returns an error, explain briefly or fix the arguments and retry.
- You can play chess and tic-tac-toe: if the user wants to play, call open_game (the game happens on the board, not in chat).
- Be warm, encouraging and brief: under 60 words unless asked for more. Plain text, emoji welcome, no markdown tables.`
}
