import * as SQLite from "expo-sqlite";
import { CREATE_TABLES_SQL } from "./schema";

const DB_NAME = "classpulse_teacher.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureColumnExists(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  alterSql: string
) {
  const tableInfo = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${tableName});`
  );
  const hasColumn = tableInfo.some((column) => column.name === columnName);

  if (!hasColumn) {
    await db.execAsync(alterSql);
  }
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initDatabase().catch((err) => {
    // Reset so the next call retries instead of returning a rejected promise forever
    dbInstance = null;
    dbInitPromise = null;
    throw err;
  });
  return dbInitPromise;
}

async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  // Enable WAL mode for better concurrent read/write performance
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  // Initialize all tables
  for (const sql of CREATE_TABLES_SQL) {
    await db.execAsync(sql);
  }

  await ensureColumnExists(
    db,
    "pending_sync_jobs",
    "session_id",
    "ALTER TABLE pending_sync_jobs ADD COLUMN session_id TEXT;"
  );

  await ensureColumnExists(
    db,
    "pending_sync_jobs",
    "job_key",
    "ALTER TABLE pending_sync_jobs ADD COLUMN job_key TEXT;"
  );

  await ensureColumnExists(
    db,
    "pending_sync_jobs",
    "next_attempt_at",
    "ALTER TABLE pending_sync_jobs ADD COLUMN next_attempt_at TEXT;"
  );

  await ensureColumnExists(
    db,
    "pending_sync_jobs",
    "completed_at",
    "ALTER TABLE pending_sync_jobs ADD COLUMN completed_at TEXT;"
  );

  await ensureColumnExists(
    db,
    "active_session",
    "session_access_token",
    "ALTER TABLE active_session ADD COLUMN session_access_token TEXT;"
  );

  await ensureColumnExists(
    db,
    "active_session",
    "session_access_token_hash",
    "ALTER TABLE active_session ADD COLUMN session_access_token_hash TEXT;"
  );

  await ensureColumnExists(
    db,
    "intervention_history",
    "recovery_window_seconds",
    "ALTER TABLE intervention_history ADD COLUMN recovery_window_seconds INTEGER NOT NULL DEFAULT 60;"
  );

  await ensureColumnExists(
    db,
    "lesson_markers",
    "synced",
    "ALTER TABLE lesson_markers ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;"
  );

  await ensureColumnExists(
    db,
    "lesson_markers",
    "synced_at",
    "ALTER TABLE lesson_markers ADD COLUMN synced_at TEXT;"
  );

  await ensureColumnExists(
    db,
    "intervention_history",
    "synced",
    "ALTER TABLE intervention_history ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;"
  );

  await ensureColumnExists(
    db,
    "intervention_history",
    "synced_at",
    "ALTER TABLE intervention_history ADD COLUMN synced_at TEXT;"
  );

  await ensureColumnExists(
    db,
    "question_cache",
    "synced",
    "ALTER TABLE question_cache ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;"
  );

  await ensureColumnExists(
    db,
    "question_cache",
    "synced_at",
    "ALTER TABLE question_cache ADD COLUMN synced_at TEXT;"
  );

  await ensureColumnExists(
    db,
    "poll_cache",
    "synced_at",
    "ALTER TABLE poll_cache ADD COLUMN synced_at TEXT;"
  );

  await ensureColumnExists(
    db,
    "poll_response_cache",
    "synced",
    "ALTER TABLE poll_response_cache ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;"
  );

  await ensureColumnExists(
    db,
    "poll_response_cache",
    "synced_at",
    "ALTER TABLE poll_response_cache ADD COLUMN synced_at TEXT;"
  );

  // Only set the module-level instance after all migrations succeed
  dbInstance = db;
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
    dbInitPromise = null;
  }
}
