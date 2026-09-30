# Decisions

Choices made without asking, and why.

## Stack & tooling
- **Vite 7, not 8.** electron-vite 5 (latest stable) peers on Vite ≤ 7. `@vitejs/plugin-react` 5 matches.
- **TypeScript 5.9, not 7.** TS 7 (native compiler) is new; 5.9 is what the Vite/React ecosystem typings are tested against.
- **better-sqlite3 13** ships N-API prebuilds, so the same binary loads in Node (Vitest) and Electron. No MSVC needed and no Electron-as-Node test runner.
- **Gemini model default: `gemini-3.8-flash`.** Checked against ai.google.dev/gemini-api/docs/models on 2026-09-29: it is the current stable Flash-tier model. The 2.5 family is access-limited for new users. The model stays a Setting.
- **Tool schemas come from zod.** Each tool has one zod schema. `z.toJSONSchema()` turns it into `parametersJsonSchema` for Gemini, and the same schema validates the arguments Gemini sends back. `$schema` and `additionalProperties` are stripped to stay within Gemini's supported subset.
- **No chart library.** History is one bar chart, and about 30 lines of SVG (`HistoryPage.tsx`) cover it with no bundle cost, theming issues or extra dependency. If more chart types are needed, add `uplot` or `chart.js`.
- **No sound files.** The alarm sounds (chime, beep, marimba, bells) are synthesised with WebAudio in `pet/sounds.ts`. There are no licences to track. "System default" uses the OS notification sound.

## Architecture
- **Chat bubble lives inside the overlay window.** One transparent window holds the pet, speech bubble and chat panel. A separate chat window would need its own positioning sync with a moving pet and its own focus dance. Opening the chat calls `focus()` so typing works. The DOM `blur` event (clicking another app) closes it, and so does Esc.
- **Click-through by cursor polling, not `forward: true`.** The overlay ignores the mouse. The renderer reports the rectangles of the pet and its bubbles, and main polls `screen.getCursorScreenPoint()` at 10 Hz, making the window clickable only while the cursor is inside one of them (held during a drag). The first version used `setIgnoreMouseEvents(true, { forward: true })` with renderer hit-testing. Measurement showed that design delivers every desktop mouse move to the overlay, and each one recomposites the full-screen transparent window: about 15% of a core whenever the mouse moved.
- **One IPC channel.** Preload exposes `invoke(channel, payload)` plus two event streams. Main keeps a whitelist map of zod schemas (`shared/ipc.ts`) and rejects unknown channels and invalid payloads. The preload imports types only, so zod never loads in the sandboxed preload.
- **Scheduler = "next fire per item" + `replan()` on every change.** Rather than updating jobs incrementally, any `changed` event on the bus cancels and recomputes all jobs. With a personal-sized dataset this costs microseconds and can't drift out of sync. All time math is pure functions in `shared/schedule.ts` and is unit-tested, including DST (America/New_York).
- **Sleep/resume.** On `suspend`, every job is cancelled. On `resume` (and on app start), a single "You missed…" summary covers alarms and events that should have fired since the last heartbeat (at most 12 h back). A heartbeat is written every minute. A job that fires more than 2 min late becomes a missed entry instead of ringing.
- **Water reminders are delivered by the pet when it's visible.** A system notification (quiet, with `+cup` / `Snooze` actions) is used when the pet is hidden, during full-screen apps, or once escalation reaches level 2. This avoids a toast every 45 minutes on top of the pet.
- **Alarms always ring,** even during full-screen apps: only the pet's visual is hidden. An alarm is usually a wake-up or a hard deadline.
- **"Pause reminders" (tray) pauses water reminders only.** Alarms and meeting reminders keep working, because silently skipping a meeting reminder would be worse than an extra nudge.
- **Alarm snoozes are in memory.** If the app restarts mid-snooze, the snooze is lost. The alarm's next regular occurrence is unaffected.
- **Streak uses the current goal** for past days (goals aren't versioned) and is capped at 366 days.
- **"Inactivity" for the pet's sleep** comes from `powerMonitor.getSystemIdleTime()` (keyboard and mouse), sent to the pet every 10 s. After 10 idle minutes it sleeps, and the next activity wakes it.
- **Idle CPU budget.** Every animated frame recomposites the whole full-screen transparent overlay, so idle cost scales with animated time. Idle motion is therefore short bursts: a 0.3 s blink every ~4.5 s and a breath every 4th time, not infinite CSS loops. Wandering averages one walk per 30 s idle, ±200 px. The loop uses rAF only while something moves and a 2 Hz timer otherwise, and writes styles only when they change. Measured in dev on this machine, idle went from 16.5% to 2.6% of one core (≈0.13% of the CPU).
- **Pet cues are queued until the pet UI is listening.** The startup "You missed…" summary was being sent before React had subscribed, so it was lost. The pet now sends `pet:ready` and main flushes the queue.
- **Deletes from the AI need confirmation; deletes in the dashboard use a native confirm dialog.** Both paths go through the same services.
- **Chat history sent to Gemini is text only** (last N messages, default 20). Tool call details are stored in `chat_history.tool_calls_json` for reference but not replayed. The per-request system prompt already carries the current events, alarms and IDs.

## Full-screen detection
- A single long-lived hidden PowerShell process checks the foreground window every 2 s, with no native modules. A window counts as full-screen if it covers its whole monitor, has no title bar and is not merely maximized (games, F11 browsers, video players). Windows' exclusive-D3D (3) and presentation-mode (4) states also count.
- **Not used: `SHQueryUserNotificationState`'s "busy" (2).** On this machine (auto-hidden taskbar) it flips on and off every few seconds for ordinary *maximized* windows. Measured with the Claude app maximized, it read 2,2,2,5,5,2. That made the pet flicker and vanish for long stretches.
- **Never counts:** the desktop and shell overlays (Alt+Tab/Task View, Start, Search, lock screen), which are also borderless and full-monitor, and SipPal's own windows.
- **Debounce:** the pet hides only after two busy readings in a row (~4 s) and comes back on the first clear one.
- **Meeting detection:** Zoom only, by checking for its `CptHost` process, which exists only during a meeting. Teams and Meet (browser) have no reliable cheap signal, so they're skipped.
- **Overlay height:** the overlay is 1 px shorter than the work area, so a topmost window exactly covering the monitor is never mistaken for a full-screen app.
- **Quit crash (fixed):** the 10 Hz cursor poll kept running after the pet window was destroyed during quit and threw "Object has been destroyed" on every tick. It is now stopped on the window's `closed` event.

## Bugs found by testing (and fixed)
- One-off events were never scheduled: the "infinite" search horizon (`8.64e15`) plus the reminder offset overflowed JS's maximum Date and became `Invalid Date`. A unit test caught it.
- zod 4's `.partial()` still applies `.default()`s, so any partial update (e.g. disabling a fired once-alarm) silently reset untouched fields such as `snooze_min` and `sound` (and `remind_before`/`recurrence` for events). Patch schemas are now built from default-free fields, with a regression test.
- The prompt line `Current ISO: …+05:30.` invited a model to copy the trailing period into the offset. The ISO is now on its own line.
- ICU reports `Asia/Calcutta`; it is normalised to `Asia/Kolkata`.

## Voice
- **Push-to-talk via Gemini transcription.** `MediaRecorder` records WebM/Opus, which isn't on Gemini's supported audio list, so the renderer decodes it and re-encodes it as 16 kHz mono WAV (`common/voice.ts`, no dependencies). Main sends it to the configured model with a "transcribe exactly" instruction, and the transcript becomes the chat message. Web Speech recognition isn't used because Electron doesn't include Google's speech backend.
- The mic permission is granted only for the `media` permission and only to SipPal's own pages. The feature can be switched off in Settings.
- **TTS** uses the built-in `speechSynthesis` (Windows SAPI voices). It is off by default.

## Security
- API key: `safeStorage` (DPAPI on Windows) encrypts it into the settings table under `secret.*`. That table prefix is excluded from `getSettings`, exports and everything sent to renderers. Renderers only see `hasApiKey: boolean`. Errors are logged by status code and a truncated message, never with request config.
- Windows use `contextIsolation`, `sandbox`, and no `nodeIntegration`. Navigation is blocked, `window.open` is denied, and https links open in the system browser. There is a CSP on both pages.
- Import validates the backup with zod, ignores unknown columns and never imports `secret.*` rows.

## UX details
- Single-click on the pet opens the chat after 260 ms, so a double-click (quick log) doesn't also open it.
- Escalation has 3 levels, each after the configured delay (default 5 min). Level 1 bounces bigger, level 2 and up shake and use a stronger bubble, and level 2 also sends one quiet system notification. It never goes past level 3.
- The AI's confirmation messages ("Got it! MERN stack meeting at 6:00 PM ✅") use the ALERT pose with a timeout, and never cover a ringing alarm's Dismiss/Snooze buttons.
- Bare hours ("at 6") are resolved by the model under an explicit prompt rule: the next occurrence between 07:00 and 22:59. `create_event` also rejects past start times with an error, so the model re-resolves them to the future.
