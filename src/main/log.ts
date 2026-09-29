import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** Append-only diagnostics at %APPDATA%/SipPal/logs/sippal.log (truncated past 1 MB). Never log secrets. */
export function logLine(...parts: unknown[]): void {
  const line = `${new Date().toISOString()} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`
  console.error(line.trimEnd())
  try {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'sippal.log')
    try {
      if (statSync(file).size > 1_000_000) writeFileSync(file, '')
    } catch {
      // first write
    }
    appendFileSync(file, line)
  } catch {
    // logging must never break the app
  }
}
