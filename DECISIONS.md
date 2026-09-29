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
- **Chat bubble lives inside the overlay window.** One transparent window hit-tests every element marked `[data-hit]` (pet, speech bubble, chat panel). The window is clickable only while the cursor is over one of them; everywhere else clicks pass through. A separate chat window would need its own positioning sync with a moving pet and its own focus dance. Opening the chat calls `focus()` so typing works. Clicking another app blurs the window, and blur closes the chat ("click outside").
- **One IPC channel.** Preload exposes `invoke(channel, payload)` plus two event streams. Main keeps a whitelist map of zod schemas (`shared/ipc.ts`) and rejects unknown channels and invalid payloads. The preload imports types only, so zod never loads in the sandboxed preload.
- **Scheduler = "next fire per item" + `replan()` on every change.** Rather than updating jobs incrementally, any `changed` event on the bus cancels and recomputes all jobs. With a personal-sized dataset this costs microseconds and can't drift out of sync. All time math is pure functions in `shared/schedule.ts` and is unit-tested, including DST (America/New_York).
- **Sleep/resume.** On `suspend`, every job is cancelled. On `resume` (and on app start), a single "You missed…" summary covers alarms and events that should have fired since the last heartbeat (at most 12 h back). A heartbeat is written every minute. A job that fires more than 2 min late becomes a missed entry instead of ringing.
- **Water reminders are delivered by the pet when it's visible.** A system notification (quiet, with `+cup` / `Snooze` actions) is used when the pet is hidden, during full-screen apps, or once escalation reaches level 2. This avoids a toast every 45 minutes on top of the pet.
- **Alarms always ring,** even during full-screen apps: only the pet's visual is hidden. An alarm is usually a wake-up or a hard deadline.
- **"Pause reminders" (tray) pauses water reminders only.** Alarms and meeting reminders keep working, because silently skipping a meeting reminder would be worse than an extra nudge.
- **Alarm snoozes are in memory.** If the app restarts mid-snooze, the snooze is lost. The alarm's next regular occurrence is unaffected.
- **Streak uses the current goal** for past days (goals aren't versioned) and is capped at 366 days.
- **"Inactivity" for the pet's sleep** means no mouse movement over the desktop for 10 minutes. The overlay receives forwarded mouse moves anyway, so this costs nothing and needs no system idle polling.
- **Deletes from the AI need confirmation; deletes in the dashboard use a native confirm dialog.** Both paths go through the same services.
- **Chat history sent to Gemini is text only** (last N messages, default 20). Tool call details are stored in `chat_history.tool_calls_json` for reference but not replayed. The per-request system prompt already carries the current events, alarms and IDs.

## Full-screen detection
- Uses a single long-lived hidden PowerShell process that polls `SHQueryUserNotificationState` every 3 s. This is the signal Windows itself uses to suppress toasts for games, full-screen video and presentations. No native modules are needed.
- **Meeting detection:** Zoom only, by checking for its `CptHost` process, which exists only during a meeting. Teams and Meet (browser) have no reliable cheap signal, so they're skipped.
- **Self-detection bug found and fixed:** with an auto-hidden taskbar, the overlay covers the whole monitor, so Windows reported *our own* overlay as a full-screen app. SipPal hid itself, the signal cleared, it re-appeared, and the cycle repeated. Two fixes: the overlay is 1 px shorter than the work area, and readings are ignored while a SipPal window is in the foreground.

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
