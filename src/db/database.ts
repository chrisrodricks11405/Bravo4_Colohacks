import * as SQLite from "expo-sqlite";
import { CREATE_TABLES_SQL } from "./schema";

const DB_NAME = "classpulse_teacher.db";
const DB_HEALTHCHECK_INTERVAL_MS = 1_000;
const DATABASE_RECOVERY_FLAG = Symbol("databaseRecoveryFlag");
const DATABASE_ORIGINAL_METHODS = Symbol("databaseOriginalMethods");

type RecoverableAsyncMethodName =
  | "execAsync"
  | "getAllAsync"
  | "getFirstAsync"
  | "prepareAsync"
  | "runAsync";

type RecoverableAsyncMethodMap = Pick<
  SQLite.SQLiteDatabase,
  RecoverableAsyncMethodName
>;

type RecoverableDatabase = SQLite.SQLiteDatabase & {
  [DATABASE_RECOVERY_FLAG]?: true;
  [DATABASE_ORIGINAL_METHODS]?: {
    [K in RecoverableAsyncMethodName]: RecoverableAsyncMethodMap[K];
  };
};

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbValidationPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;
let lastValidatedAt = 0;

function isCreateIndexStatement(sql: string) {
  return /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(sql);
}

function isReleasedDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("already released") ||
    message.includes("cannot use shared object") ||
    message.includes("cannot be cast to type expo.modules.sqlite.nativedatabase") ||
    message.includes("access to closed resource")
  );
}

function resetDatabaseState() {
  dbInstance = null;
  dbInitPromise = null;
  dbValidationPromise = null;
  lastValidatedAt = 0;
}

async function recoverDatabase(staleDb: SQLite.SQLiteDatabase) {
  const shouldCloseDatabase = dbInstance === staleDb || dbInstance == null;

  if (dbInstance === staleDb) {
    resetDatabaseState();
  }

  if (shouldCloseDatabase) {
    try {
      await staleDb.closeAsync();
    } catch (error) {
      if (!isReleasedDatabaseError(error)) {
        throw error;
      }
    }
  }

  return getDatabase();
}

async function invokeWithRecovery<K extends RecoverableAsyncMethodName>(
  db: RecoverableDatabase,
  methodName: K,
  args: Parameters<RecoverableAsyncMethodMap[K]>,
  hasRetried = false
): Promise<Awaited<ReturnType<RecoverableAsyncMethodMap[K]>>> {
  const method = db[DATABASE_ORIGINAL_METHODS]?.[methodName];

  if (!method) {
    throw new Error(`Missing original SQLite method: ${methodName}`);
  }

  try {
    return await (
      method as (...methodArgs: Parameters<RecoverableAsyncMethodMap[K]>) => ReturnType<RecoverableAsyncMethodMap[K]>
    )(...args);
  } catch (error) {
    if (hasRetried || !isReleasedDatabaseError(error)) {
      throw error;
    }

    const recoveredDb = (await recoverDatabase(db)) as RecoverableDatabase;
    return invokeWithRecovery(recoveredDb, methodName, args, true);
  }
}

function enhanceDatabase(db: SQLite.SQLiteDatabase): SQLite.SQLiteDatabase {
  const recoverableDb = db as RecoverableDatabase;

  if (recoverableDb[DATABASE_RECOVERY_FLAG]) {
    return recoverableDb;
  }

  recoverableDb[DATABASE_ORIGINAL_METHODS] = {
    execAsync: db.execAsync.bind(db),
    getAllAsync: db.getAllAsync.bind(db),
    getFirstAsync: db.getFirstAsync.bind(db),
    prepareAsync: db.prepareAsync.bind(db),
    runAsync: db.runAsync.bind(db),
  };
  recoverableDb[DATABASE_RECOVERY_FLAG] = true;

  recoverableDb.execAsync = ((...args: Parameters<SQLite.SQLiteDatabase["execAsync"]>) =>
    invokeWithRecovery(
      recoverableDb,
      "execAsync",
      args as Parameters<RecoverableAsyncMethodMap["execAsync"]>
    )) as SQLite.SQLiteDatabase["execAsync"];

  recoverableDb.getAllAsync = ((...args: Parameters<SQLite.SQLiteDatabase["getAllAsync"]>) =>
    invokeWithRecovery(
      recoverableDb,
      "getAllAsync",
      args as Parameters<RecoverableAsyncMethodMap["getAllAsync"]>
    )) as SQLite.SQLiteDatabase["getAllAsync"];

  recoverableDb.getFirstAsync = ((...args: Parameters<SQLite.SQLiteDatabase["getFirstAsync"]>) =>
    invokeWithRecovery(
      recoverableDb,
      "getFirstAsync",
      args as Parameters<RecoverableAsyncMethodMap["getFirstAsync"]>
    )) as SQLite.SQLiteDatabase["getFirstAsync"];

  recoverableDb.prepareAsync = ((...args: Parameters<SQLite.SQLiteDatabase["prepareAsync"]>) =>
    invokeWithRecovery(
      recoverableDb,
      "prepareAsync",
      args as Parameters<RecoverableAsyncMethodMap["prepareAsync"]>
    )) as SQLite.SQLiteDatabase["prepareAsync"];

  recoverableDb.runAsync = ((...args: Parameters<SQLite.SQLiteDatabase["runAsync"]>) =>
    invokeWithRecovery(
      recoverableDb,
      "runAsync",
      args as Parameters<RecoverableAsyncMethodMap["runAsync"]>
    )) as SQLite.SQLiteDatabase["runAsync"];

  return recoverableDb;
}

async function validateDatabase(
  db: SQLite.SQLiteDatabase
): Promise<SQLite.SQLiteDatabase | null> {
  if (Date.now() - lastValidatedAt < DB_HEALTHCHECK_INTERVAL_MS) {
    return db;
  }

  if (dbValidationPromise) {
    return dbValidationPromise;
  }

  dbValidationPromise = (async () => {
    try {
      await db.getFirstAsync("SELECT 1;");
      lastValidatedAt = Date.now();
      return dbInstance ?? db;
    } catch (error) {
      if (!isReleasedDatabaseError(error)) {
        throw error;
      }

      if (dbInstance === db) {
        resetDatabaseState();
      }

      return null;
    } finally {
      dbValidationPromise = null;
    }
  })();

  return dbValidationPromise;
}

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

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    const validatedDb = await validateDatabase(dbInstance);
    if (validatedDb) {
      return validatedDb;
    }
  }
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initDatabase().catch((err) => {
    // Reset so the next call retries instead of returning a rejected promise forever
    resetDatabaseState();
    throw err;
  });
  return dbInitPromise;
}

async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  const schemaStatements = CREATE_TABLES_SQL.reduce<{
    tableStatements: string[];
    indexStatements: string[];
  }>(
    (acc, sql) => {
      if (isCreateIndexStatement(sql)) {
        acc.indexStatements.push(sql);
      } else {
        acc.tableStatements.push(sql);
      }
      return acc;
    },
    { tableStatements: [], indexStatements: [] }
  );

  // Enable WAL mode for better concurrent read/write performance
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  // Create base tables first so compatibility migrations can safely inspect and alter them.
  for (const sql of schemaStatements.tableStatements) {
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
    "reason",
    "ALTER TABLE question_cache ADD COLUMN reason TEXT;"
  );

  await ensureColumnExists(
    db,
    "local_pulse_events",
    "reason",
    "ALTER TABLE local_pulse_events ADD COLUMN reason TEXT;"
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

  // Build indexes after column migrations so upgraded installs do not fail on missing legacy columns.
  for (const sql of schemaStatements.indexStatements) {
    await db.execAsync(sql);
  }

  const enhancedDb = enhanceDatabase(db);

  // Only set the module-level instance after all migrations succeed
  dbInstance = enhancedDb;
  lastValidatedAt = Date.now();
  return enhancedDb;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    const database = dbInstance;
    resetDatabaseState();

    try {
      await database.closeAsync();
    } catch (error) {
      if (!isReleasedDatabaseError(error)) {
        throw error;
      }
    }
  }
}
