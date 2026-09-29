# SipPal — Plan

## Architecture

```
┌──────────────────────── main process ────────────────────────┐
│ index.ts   app lifecycle, single-instance, power events       │
│ windows.ts pet overlay + dashboard, click-through, broadcast  │
│ tray.ts    tray menu                                          │
│ ipc.ts     one zod-validated handler per channel              │
│ db.ts      better-sqlite3 + ordered migrations                │
│ bus.ts     EventEmitter: 'changed'(domain) / 'pet'(cue)       │
│ services/  settings, water, events, alarms, chat, data         │
│ scheduler  node-schedule, one job per item ("next fire"),     │
│            replan() on every change, missed-summary on resume │
│ ai/        prompt (rebuilt per request), tools (zod-validated │
│            handlers + pending confirmations), assistant loop  │
│ secret.ts  safeStorage-encrypted Gemini key (never leaves main)│
│ fullscreen.ts  PowerShell SHQueryUserNotificationState poller │
└───────────────────────────────────────────────────────────────┘
        ▲ invoke(channel, payload)   │ 'bus' events
        │ (preload contextBridge)    ▼
┌─ pet overlay (transparent, click-through) ─┐ ┌─ dashboard ─────────┐
│ FSM + rAF physics, pluggable renderer,     │ │ Today/History/      │
│ speech bubble, chat bubble, alarm sounds   │ │ Schedule/Alarms/    │
│ (WebAudio), mic → WAV → main → Gemini      │ │ Chat/Settings       │
└────────────────────────────────────────────┘ └─────────────────────┘
src/shared: types, zod schemas, IPC contract, time math, water math
```

Data flow: renderer → `invoke` → main validates → service writes DB → `bus.changed(domain)` →
scheduler replans + every window refetches that domain. AI tools go through the same services, so
AI changes update dashboard, scheduler and pet the same way manual changes do.

## Folder structure

```
src/main/        index, windows, tray, ipc, db, bus, scheduler, secret, fullscreen, icon
src/main/services/  settings, water, events, alarms, chat, data
src/main/ai/     prompt, tools, assistant
src/preload/     index.ts (typed contextBridge API)
src/renderer/    pet.html, dashboard.html
src/renderer/pet/        Pet, fsm, DropletRenderer, bubbles, sounds, voice
src/renderer/dashboard/  App + pages
src/shared/      types, schemas, ipc, time, water
tests/           vitest (run under Electron-as-Node so better-sqlite3's ABI matches)
```

## Milestones

- M1 scaffold, tray, single instance, SQLite + migrations, settings, secure IPC
- M2 water logging, goal math, reminder scheduler, notifications, Today tab
- M3 pet overlay: click-through, droplet character, FSM, drag, clicks, thirsty/celebrate
- M4 alarms + events CRUD, recurrence, missed reminders, ALERT, sounds
- M5 Gemini: key storage, tools, loop, confirmation, chat UIs, live updates
- M6 history charts, streaks, settings, export/import, full-screen detection, auto-launch
- M7 polish, tests, NSIS installer
