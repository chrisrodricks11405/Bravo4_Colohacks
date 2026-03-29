import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "../db";
import { hasSupabaseConfig } from "../lib/supabase";
import { useNetworkStore } from "../stores";
import type { SyncJob, SyncJobStatus, SyncQueueOverview } from "../types";

type SyncJobRow = {
  id: string;
  type: string;
  payload: string;
  session_id: string | null;
  job_key: string | null;
  status: SyncJobStatus;
  retry_count: number;
  created_at: string;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  completed_at: string | null;
  error: string | null;
};

type CountRow = { count: number };
type LastSyncRow = { last_sync_at: string | null };
type NextRetryRow = { next_retry_at: string | null };

export interface QueueSyncJobInput {
  type: SyncJob["type"];
  payload: unknown;
  sessionId?: string;
  jobKey?: string;
  errorMessage?: string;
  dedupe?: "ignore" | "replace" | "none";
}

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeSyncJob(row: SyncJobRow): SyncJob {
  return {
    id: row.id,
    type: row.type as SyncJob["type"],
    payload: row.payload,
    sessionId: row.session_id ?? undefined,
    jobKey: row.job_key ?? undefined,
    status: row.status,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    lastAttemptAt: row.last_attempt_at ?? undefined,
    nextAttemptAt: row.next_attempt_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
  };
}

async function getExistingJob(jobKey: string): Promise<SyncJobRow | null> {
  const db = await getDatabase();

  return db.getFirstAsync<SyncJobRow>(
    `
      SELECT
        id,
        type,
        payload,
        session_id,
        job_key,
        status,
        retry_count,
        created_at,
        last_attempt_at,
        next_attempt_at,
        completed_at,
        error
      FROM pending_sync_jobs
      WHERE job_key = ?
        AND status != 'completed'
      ORDER BY datetime(created_at) DESC
      LIMIT 1;
    `,
    jobKey
  );
}

async function syncOverviewToStore() {
  try {
    const overview = await getSyncQueueOverview();
    useNetworkStore.getState().setSyncOverview({
      pendingSyncCount:
        overview.pendingJobs + overview.failedJobs + overview.inProgressJobs,
      failedSyncCount: overview.failedJobs,
      localQueueCount: overview.localQueueCount,
      lastSyncAt: overview.lastSyncAt,
      nextRetryAt: overview.nextRetryAt,
    });
  } catch {
    // Ignore transient database issues when refreshing the indicator store.
  }
}

export async function queueSyncJob(
  input: QueueSyncJobInput
): Promise<SyncJob | null> {
  if (!hasSupabaseConfig) {
    return null;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  const dedupe = input.dedupe ?? "none";
  const payload = JSON.stringify(input.payload);

  if (input.jobKey && dedupe !== "none") {
    const existing = await getExistingJob(input.jobKey);

    if (existing && dedupe === "ignore") {
      void syncOverviewToStore();
      return normalizeSyncJob(existing);
    }

    if (existing && dedupe === "replace") {
      await db.runAsync(
        `
          UPDATE pending_sync_jobs
          SET type = ?,
              payload = ?,
              session_id = ?,
              status = 'pending',
              retry_count = 0,
              last_attempt_at = NULL,
              next_attempt_at = ?,
              completed_at = NULL,
              error = ?
          WHERE id = ?;
        `,
        input.type,
        payload,
        input.sessionId ?? null,
        now,
        input.errorMessage ?? null,
        existing.id
      );

      const updated = await db.getFirstAsync<SyncJobRow>(
        `
          SELECT
            id,
            type,
            payload,
            session_id,
            job_key,
            status,
            retry_count,
            created_at,
            last_attempt_at,
            next_attempt_at,
            completed_at,
            error
          FROM pending_sync_jobs
          WHERE id = ?
          LIMIT 1;
        `,
        existing.id
      );

      await syncOverviewToStore();
      return updated ? normalizeSyncJob(updated) : null;
    }
  }

  const id = generateId("sync");
  await db.runAsync(
    `
      INSERT INTO pending_sync_jobs (
        id,
        type,
        payload,
        session_id,
        job_key,
        status,
        retry_count,
        created_at,
        last_attempt_at,
        next_attempt_at,
        completed_at,
        error
      )
      VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, NULL, ?, NULL, ?);
    `,
    id,
    input.type,
    payload,
    input.sessionId ?? null,
    input.jobKey ?? null,
    now,
    now,
    input.errorMessage ?? null
  );

  await syncOverviewToStore();

  return {
    id,
    type: input.type,
    payload,
    sessionId: input.sessionId,
    jobKey: input.jobKey,
    status: "pending",
    retryCount: 0,
    createdAt: now,
    nextAttemptAt: now,
    error: input.errorMessage,
  };
}

export async function listSyncJobs(args?: {
  limit?: number;
  statuses?: SyncJobStatus[];
}): Promise<SyncJob[]> {
  const db = await getDatabase();
  const limit = args?.limit ?? 50;
  const statuses = args?.statuses ?? [];

  if (statuses.length > 0) {
    const placeholders = statuses.map(() => "?").join(", ");
    const rows = await db.getAllAsync<SyncJobRow>(
      `
        SELECT
          id,
          type,
          payload,
          session_id,
          job_key,
          status,
          retry_count,
          created_at,
          last_attempt_at,
          next_attempt_at,
          completed_at,
          error
        FROM pending_sync_jobs
        WHERE status IN (${placeholders})
        ORDER BY
          CASE status
            WHEN 'in_progress' THEN 0
            WHEN 'failed' THEN 1
            WHEN 'pending' THEN 2
            ELSE 3
          END,
          datetime(created_at) DESC
        LIMIT ?;
      `,
      ...statuses,
      limit
    );

    return rows.map(normalizeSyncJob);
  }

  const rows = await db.getAllAsync<SyncJobRow>(
    `
      SELECT
        id,
        type,
        payload,
        session_id,
        job_key,
        status,
        retry_count,
        created_at,
        last_attempt_at,
        next_attempt_at,
        completed_at,
        error
      FROM pending_sync_jobs
      ORDER BY datetime(created_at) DESC
      LIMIT ?;
    `,
    limit
  );

  return rows.map(normalizeSyncJob);
}

export async function listDueSyncJobs(limit = 20): Promise<SyncJob[]> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const rows = await db.getAllAsync<SyncJobRow>(
    `
      SELECT
        id,
        type,
        payload,
        session_id,
        job_key,
        status,
        retry_count,
        created_at,
        last_attempt_at,
        next_attempt_at,
        completed_at,
        error
      FROM pending_sync_jobs
      WHERE status IN ('pending', 'failed')
        AND (
          next_attempt_at IS NULL OR
          datetime(next_attempt_at) <= datetime(?)
        )
      ORDER BY datetime(created_at) ASC
      LIMIT ?;
    `,
    now,
    limit
  );

  return rows.map(normalizeSyncJob);
}

export async function markSyncJobInProgress(jobId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE pending_sync_jobs
      SET status = 'in_progress',
          last_attempt_at = ?,
          error = NULL
      WHERE id = ?;
    `,
    now,
    jobId
  );

  await syncOverviewToStore();
}

export async function completeSyncJob(jobId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE pending_sync_jobs
      SET status = 'completed',
          completed_at = ?,
          next_attempt_at = NULL,
          error = NULL
      WHERE id = ?;
    `,
    now,
    jobId
  );

  await syncOverviewToStore();
}

export async function failSyncJob(
  jobId: string,
  errorMessage: string,
  nextAttemptAt: string
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE pending_sync_jobs
      SET status = 'failed',
          retry_count = retry_count + 1,
          last_attempt_at = ?,
          next_attempt_at = ?,
          error = ?
      WHERE id = ?;
    `,
    now,
    nextAttemptAt,
    errorMessage,
    jobId
  );

  await syncOverviewToStore();
}

export async function retryFailedSyncJobs(): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE pending_sync_jobs
      SET status = 'pending',
          next_attempt_at = ?,
          error = NULL
      WHERE status = 'failed';
    `,
    now
  );

  await syncOverviewToStore();
}

async function countRows(
  db: SQLiteDatabase,
  sql: string
): Promise<number> {
  const row = await db.getFirstAsync<CountRow>(sql);
  return row?.count ?? 0;
}

async function getLocalQueueCount(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<CountRow>(
    `
      SELECT (
        (SELECT COUNT(*) FROM local_pulse_events WHERE synced = 0) +
        (SELECT COUNT(*) FROM question_cache WHERE synced = 0) +
        (SELECT COUNT(*) FROM lesson_markers WHERE synced = 0) +
        (SELECT COUNT(*) FROM intervention_history WHERE synced = 0) +
        (SELECT COUNT(*) FROM poll_cache WHERE synced = 0) +
        (SELECT COUNT(*) FROM poll_response_cache WHERE synced = 0) +
        (SELECT COUNT(*) FROM session_summaries WHERE synced = 0) +
        (SELECT COUNT(*) FROM recent_sessions WHERE synced = 0)
      ) AS count;
    `
  );

  return row?.count ?? 0;
}

export async function getSyncQueueOverview(): Promise<SyncQueueOverview> {
  const db = await getDatabase();
  const [
    pendingJobs,
    failedJobs,
    inProgressJobs,
    completedJobs,
    localQueueCount,
    lastSyncRow,
    nextRetryRow,
  ] = await Promise.all([
    countRows(
      db,
      `
      SELECT COUNT(*) AS count
      FROM pending_sync_jobs
      WHERE status = 'pending';
    `
    ),
    countRows(
      db,
      `
      SELECT COUNT(*) AS count
      FROM pending_sync_jobs
      WHERE status = 'failed';
    `
    ),
    countRows(
      db,
      `
      SELECT COUNT(*) AS count
      FROM pending_sync_jobs
      WHERE status = 'in_progress';
    `
    ),
    countRows(
      db,
      `
      SELECT COUNT(*) AS count
      FROM pending_sync_jobs
      WHERE status = 'completed';
    `
    ),
    getLocalQueueCount(db),
    db.getFirstAsync<LastSyncRow>(
      `
        SELECT MAX(completed_at) AS last_sync_at
        FROM pending_sync_jobs
        WHERE completed_at IS NOT NULL;
      `
    ),
    db.getFirstAsync<NextRetryRow>(
      `
        SELECT MIN(next_attempt_at) AS next_retry_at
        FROM pending_sync_jobs
        WHERE status IN ('pending', 'failed')
          AND next_attempt_at IS NOT NULL;
      `
    ),
  ]);

  return {
    localQueueCount,
    pendingJobs,
    failedJobs,
    inProgressJobs,
    completedJobs,
    lastSyncAt: lastSyncRow?.last_sync_at ?? null,
    nextRetryAt: nextRetryRow?.next_retry_at ?? null,
  };
}
