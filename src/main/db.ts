import Database from 'better-sqlite3'

type DB = Database.Database

/** Append-only. Each entry runs once, tracked by PRAGMA user_version. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE water_logs (
    id INTEGER PRIMARY KEY,
    amount_ml INTEGER NOT NULL CHECK (amount_ml > 0),
    logged_at TEXT NOT NULL,
    source TEXT NOT NULL
  );
  CREATE INDEX water_logs_logged_at ON water_logs (logged_at);
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT,
    remind_before_json TEXT NOT NULL DEFAULT '[10]',
    recurrence TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'active',
    created_via TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE alarms (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    time_hhmm TEXT NOT NULL,
    repeat TEXT NOT NULL,
    days_json TEXT NOT NULL DEFAULT '[]',
    sound TEXT NOT NULL,
    snooze_min INTEGER NOT NULL DEFAULT 5,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE chat_history (
    id INTEGER PRIMARY KEY,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls_json TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE reminder_log (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    ref_id INTEGER,
    fired_at TEXT NOT NULL,
    action TEXT NOT NULL
  );
  `
]

let db: DB | null = null

export function openDb(file: string): DB {
  db?.close()
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export function migrate(d: DB): void {
  const current = d.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    d.transaction(() => {
      d.exec(MIGRATIONS[v])
      d.pragma(`user_version = ${v + 1}`)
    })()
  }
}

export function getDb(): DB {
  if (!db) throw new Error('Database not opened')
  return db
}

export const TABLES = ['settings', 'water_logs', 'events', 'alarms', 'chat_history', 'reminder_log'] as const
