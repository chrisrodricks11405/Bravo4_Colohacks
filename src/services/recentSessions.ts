import { getDatabase } from "../db";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import type { RecentSession, RecentSessionSyncResult } from "../types";

type RecentSessionRow = {
  id: string;
  subject: string;
  topic: string;
  grade_class: string;
  status: string;
  participant_count: number;
  created_at: string;
  ended_at: string | null;
  confusion_index_avg: number | null;
  synced: number;
};

type CountRow = { count: number };
type UnknownRow = Record<string, unknown>;

const UPSERT_RECENT_SESSION_SQL = `
  INSERT INTO recent_sessions (
    id,
    subject,
    topic,
    grade_class,
    status,
    participant_count,
    created_at,
    ended_at,
    confusion_index_avg,
    synced
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    subject = excluded.subject,
    topic = excluded.topic,
    grade_class = excluded.grade_class,
    status = excluded.status,
    participant_count = excluded.participant_count,
    created_at = excluded.created_at,
    ended_at = excluded.ended_at,
    confusion_index_avg = excluded.confusion_index_avg,
    synced = excluded.synced;
`;

const recentSessionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_RECENT_SESSIONS_TABLE ?? "recent_sessions";

function toRecentSession(row: RecentSessionRow): RecentSession {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    gradeClass: row.grade_class,
    status: row.status,
    participantCount: row.participant_count,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    confusionIndexAvg: row.confusion_index_avg,
    synced: Boolean(row.synced),
  };
}

function readString(row: UnknownRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function readNumber(row: UnknownRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readBoolean(row: UnknownRow, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value > 0;
    }

    if (typeof value === "string") {
      return value === "true" || value === "1";
    }
  }

  return false;
}

function normalizeRemoteSession(row: UnknownRow): RecentSession | null {
  const id = readString(row, "id", "session_id");
  const subject = readString(row, "subject");
  const topic = readString(row, "topic");
  const gradeClass = readString(row, "grade_class", "gradeClass");
  const status = readString(row, "status") ?? "ended";
  const createdAt = readString(row, "created_at", "createdAt");

  if (!id || !subject || !topic || !gradeClass || !createdAt) {
    return null;
  }

  const syncedValue = row.synced;

  return {
    id,
    subject,
    topic,
    gradeClass,
    status,
    participantCount: readNumber(row, "participant_count", "participantCount") ?? 0,
    createdAt,
    endedAt: readString(row, "ended_at", "endedAt"),
    confusionIndexAvg: readNumber(
      row,
      "confusion_index_avg",
      "confusionIndexAvg",
      "avg_confusion_index"
    ),
    synced: syncedValue === undefined ? true : readBoolean(row, "synced"),
  };
}

export async function listRecentSessions(limit = 12): Promise<RecentSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RecentSessionRow>(
    `
      SELECT
        id,
        subject,
        topic,
        grade_class,
        status,
        participant_count,
        created_at,
        ended_at,
        confusion_index_avg,
        synced
      FROM recent_sessions
      ORDER BY datetime(created_at) DESC
      LIMIT ?;
    `,
    limit
  );

  return rows.map(toRecentSession);
}

export async function upsertRecentSessions(sessions: RecentSession[]): Promise<void> {
  if (sessions.length === 0) {
    return;
  }

  const db = await getDatabase();

  for (const session of sessions) {
    await db.runAsync(
      UPSERT_RECENT_SESSION_SQL,
      session.id,
      session.subject,
      session.topic,
      session.gradeClass,
      session.status,
      session.participantCount,
      session.createdAt,
      session.endedAt ?? null,
      session.confusionIndexAvg ?? null,
      session.synced ? 1 : 0
    );
  }
}

export async function countPendingSyncJobs(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CountRow>(
    `
      SELECT COUNT(*) AS count
      FROM pending_sync_jobs
      WHERE status != 'completed';
    `
  );

  return row?.count ?? 0;
}

async function fetchRemoteRecentSessions(
  teacherId: string,
  limit: number
): Promise<RecentSession[]> {
  if (!hasSupabaseConfig) {
    return [];
  }

  const { data, error } = await supabase
    .from(recentSessionsTable)
    .select("*")
    .eq("teacher_id", teacherId)
    .limit(limit);

  if (error) {
    throw error;
  }

  const normalized = (data ?? [])
    .map((row) => normalizeRemoteSession(row as UnknownRow))
    .filter((row): row is RecentSession => Boolean(row))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return normalized;
}

export async function syncRecentSessionsFromSupabase(
  teacherId: string,
  limit = 12
): Promise<RecentSessionSyncResult> {
  if (!teacherId || !hasSupabaseConfig) {
    return {
      syncedCount: 0,
      syncedAt: null,
      source: "local",
    };
  }

  const remoteSessions = await fetchRemoteRecentSessions(teacherId, limit);

  if (remoteSessions.length > 0) {
    await upsertRecentSessions(remoteSessions);
  }

  return {
    syncedCount: remoteSessions.length,
    syncedAt: new Date().toISOString(),
    source: "supabase",
  };
}
