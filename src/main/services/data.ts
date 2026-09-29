import { z } from 'zod'
import { getDb, TABLES } from '../db'
import { changed } from '../bus'

const Row = z.record(z.string(), z.union([z.string(), z.number(), z.null()]))
const Backup = z.object({
  app: z.literal('SipPal'),
  version: z.number().int(),
  tables: z.object(Object.fromEntries(TABLES.map((t) => [t, z.array(Row).max(1_000_000)])) as Record<(typeof TABLES)[number], z.ZodArray<typeof Row>>)
})

const COLUMNS: Record<string, string[]> = {}
function columns(table: string): string[] {
  return (COLUMNS[table] ??= (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))
}

/** Everything except the encrypted API key (it can't be decrypted on another machine anyway). */
export function exportAll(): string {
  const tables = Object.fromEntries(
    TABLES.map((t) => [t, getDb().prepare(t === 'settings' ? `SELECT * FROM settings WHERE key NOT LIKE 'secret.%'` : `SELECT * FROM ${t}`).all()])
  )
  return JSON.stringify({ app: 'SipPal', version: getDb().pragma('user_version', { simple: true }), exportedAt: new Date().toISOString(), tables }, null, 2)
}

export function importAll(json: string): void {
  const data = Backup.parse(JSON.parse(json))
  const db = getDb()
  db.transaction(() => {
    wipe(false)
    for (const t of TABLES) {
      const cols = columns(t)
      for (const row of data.tables[t]) {
        if (t === 'settings' && String(row.key).startsWith('secret.')) continue
        const keys = Object.keys(row).filter((k) => cols.includes(k)) // ignore unknown columns
        if (!keys.length) continue
        db.prepare(`INSERT INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k]))
      }
    }
  })()
  notifyAll()
}

/** Delete all user data. Keeps the API key unless `includeKey`. */
export function wipe(includeKey = true): void {
  const db = getDb()
  for (const t of TABLES) db.prepare(t === 'settings' && !includeKey ? `DELETE FROM settings WHERE key NOT LIKE 'secret.%'` : `DELETE FROM ${t}`).run()
}

export function notifyAll(): void {
  for (const d of ['settings', 'water', 'events', 'alarms', 'chat'] as const) changed(d)
}
