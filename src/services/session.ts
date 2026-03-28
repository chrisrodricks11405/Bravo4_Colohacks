import * as Linking from "expo-linking";
import { getDatabase } from "../db";
import { supabase, hasSupabaseConfig } from "../lib/supabase";
import { queueSyncJob } from "./syncJobs";
import type { SessionCreatePayload, SessionMeta, SessionStatus, SyncJobType } from "../types";
import { upsertRecentSessions } from "./recentSessions";

type ActiveSessionRow = {
  id: string;
  teacher_id: string;
  join_code: string;
  qr_payload: string;
  subject: string;
  topic: string;
  grade_class: string;
  language: string;
  lost_threshold: number;
  mode: "online" | "offline";
  lesson_plan_seed: string | null;
  status: SessionStatus;
  participant_count: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  locked_at: string | null;
};

type CountRow = { count: number };
type AverageRow = { confusion_index_avg: number | null };
type UnknownRow = Record<string, unknown>;

type SessionMutationOptions = {
  attemptRemoteSync?: boolean;
  queueOnFailure?: boolean;
};

export type SessionChannelStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "disabled";

interface SessionLobbySubscriptionCallbacks {
  onParticipantCount?: (count: number) => void;
  onSessionUpdated?: (session: SessionMeta) => void;
  onStatusChange?: (status: SessionChannelStatus) => void;
  onError?: (message: string) => void;
}

const sessionsTable = process.env.EXPO_PUBLIC_SUPABASE_SESSIONS_TABLE ?? "sessions";
const participantsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_PARTICIPANTS_TABLE ?? "session_participants";
const joinBaseUrl = process.env.EXPO_PUBLIC_SESSION_JOIN_BASE_URL?.trim();

const UPSERT_ACTIVE_SESSION_SQL = `
  INSERT INTO active_session (
    id,
    teacher_id,
    join_code,
    qr_payload,
    subject,
    topic,
    grade_class,
    language,
    lost_threshold,
    mode,
    lesson_plan_seed,
    status,
    participant_count,
    created_at,
    started_at,
    ended_at,
    locked_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    teacher_id = excluded.teacher_id,
    join_code = excluded.join_code,
    qr_payload = excluded.qr_payload,
    subject = excluded.subject,
    topic = excluded.topic,
    grade_class = excluded.grade_class,
    language = excluded.language,
    lost_threshold = excluded.lost_threshold,
    mode = excluded.mode,
    lesson_plan_seed = excluded.lesson_plan_seed,
    status = excluded.status,
    participant_count = excluded.participant_count,
    created_at = excluded.created_at,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    locked_at = excluded.locked_at;
`;

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

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function buildJoinUrl(sessionId: string, joinCode: string, mode: "online" | "offline") {
  const queryParams = {
    sessionId,
    code: joinCode,
    mode,
  };

  if (joinBaseUrl) {
    const params = new URLSearchParams(queryParams);
    const separator = joinBaseUrl.includes("?") ? "&" : "?";
    return `${joinBaseUrl}${separator}${params.toString()}`;
  }

  return Linking.createURL("/join", { queryParams });
}

function normalizeSession(row: ActiveSessionRow): SessionMeta {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    joinCode: row.join_code,
    qrPayload: row.qr_payload,
    subject: row.subject,
    topic: row.topic,
    gradeClass: row.grade_class,
    language: row.language,
    lostThreshold: row.lost_threshold,
    mode: row.mode,
    lessonPlanSeed: row.lesson_plan_seed ?? undefined,
    status: row.status,
    participantCount: row.participant_count,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    lockedAt: row.locked_at ?? undefined,
  };
}

function normalizeRemoteSession(row: UnknownRow): SessionMeta | null {
  const id = readString(row, "id");
  const teacherId = readString(row, "teacher_id", "teacherId");
  const joinCode = readString(row, "join_code", "joinCode");
  const qrPayload = readString(row, "qr_payload", "qrPayload");
  const subject = readString(row, "subject");
  const topic = readString(row, "topic");
  const gradeClass = readString(row, "grade_class", "gradeClass");
  const language = readString(row, "language");
  const status = (readString(row, "status") as SessionStatus | null) ?? "lobby";
  const createdAt = readString(row, "created_at", "createdAt");
  const mode = (readString(row, "mode") as "online" | "offline" | null) ?? "online";

  if (
    !id ||
    !teacherId ||
    !joinCode ||
    !qrPayload ||
    !subject ||
    !topic ||
    !gradeClass ||
    !language ||
    !createdAt
  ) {
    return null;
  }

  return {
    id,
    teacherId,
    joinCode,
    qrPayload,
    subject,
    topic,
    gradeClass,
    language,
    lostThreshold: readNumber(row, "lost_threshold", "lostThreshold") ?? 40,
    mode,
    lessonPlanSeed: readString(row, "lesson_plan_seed", "lessonPlanSeed") ?? undefined,
    status,
    participantCount: readNumber(row, "participant_count", "participantCount") ?? 0,
    createdAt,
    startedAt: readString(row, "started_at", "startedAt") ?? undefined,
    endedAt: readString(row, "ended_at", "endedAt") ?? undefined,
    lockedAt: readString(row, "locked_at", "lockedAt") ?? undefined,
  };
}

function toRecentSession(
  session: SessionMeta,
  synced: boolean,
  confusionIndexAvg: number | null = null
) {
  return {
    id: session.id,
    subject: session.subject,
    topic: session.topic,
    gradeClass: session.gradeClass,
    status: session.status,
    participantCount: session.participantCount,
    createdAt: session.createdAt,
    endedAt: session.endedAt ?? null,
    confusionIndexAvg,
    synced,
  };
}

function sessionToRemoteRow(session: SessionMeta) {
  return {
    id: session.id,
    teacher_id: session.teacherId,
    join_code: session.joinCode,
    qr_payload: session.qrPayload,
    subject: session.subject,
    topic: session.topic,
    grade_class: session.gradeClass,
    language: session.language,
    lost_threshold: session.lostThreshold,
    mode: session.mode,
    lesson_plan_seed: session.lessonPlanSeed ?? null,
    status: session.status,
    participant_count: session.participantCount,
    created_at: session.createdAt,
    started_at: session.startedAt ?? null,
    ended_at: session.endedAt ?? null,
    locked_at: session.lockedAt ?? null,
  };
}

async function persistActiveSession(session: SessionMeta) {
  const db = await getDatabase();

  await db.runAsync("DELETE FROM active_session WHERE id != ?;", session.id);
  await db.runAsync(
    UPSERT_ACTIVE_SESSION_SQL,
    session.id,
    session.teacherId,
    session.joinCode,
    session.qrPayload,
    session.subject,
    session.topic,
    session.gradeClass,
    session.language,
    session.lostThreshold,
    session.mode,
    session.lessonPlanSeed ?? null,
    session.status,
    session.participantCount,
    session.createdAt,
    session.startedAt ?? null,
    session.endedAt ?? null,
    session.lockedAt ?? null
  );
}

async function enqueueSyncJob(type: SyncJobType, payload: SessionMeta, errorMessage?: string) {
  await queueSyncJob({
    type,
    payload,
    sessionId: payload.id,
    jobKey: `session:${payload.id}:${type}`,
    errorMessage,
    dedupe: "replace",
  });
}

async function syncSessionToSupabase(session: SessionMeta) {
  const { error } = await supabase
    .from(sessionsTable)
    .upsert(sessionToRemoteRow(session), { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function isJoinCodeTaken(joinCode: string, ignoreSessionId?: string) {
  const db = await getDatabase();
  const localRow = await db.getFirstAsync<CountRow>(
    `
      SELECT COUNT(*) AS count
      FROM active_session
      WHERE join_code = ?
        AND (? IS NULL OR id != ?);
    `,
    joinCode,
    ignoreSessionId ?? null,
    ignoreSessionId ?? null
  );

  if ((localRow?.count ?? 0) > 0) {
    return true;
  }

  if (!hasSupabaseConfig) {
    return false;
  }

  const query = supabase
    .from(sessionsTable)
    .select("id", { count: "exact", head: true })
    .eq("join_code", joinCode)
    .in("status", ["lobby", "active"]);

  const { count, error } = ignoreSessionId
    ? await query.neq("id", ignoreSessionId)
    : await query;

  if (error) {
    return false;
  }

  return (count ?? 0) > 0;
}

async function generateUniqueJoinCode(ignoreSessionId?: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const joinCode = `${Math.floor(1000 + Math.random() * 9000)}`;
    const taken = await isJoinCodeTaken(joinCode, ignoreSessionId);

    if (!taken) {
      return joinCode;
    }
  }

  return `${Math.floor(1000 + Math.random() * 9000)}`;
}

async function saveSessionState(
  session: SessionMeta,
  options: SessionMutationOptions & {
    syncJobType: SyncJobType;
    confusionIndexAvg?: number | null;
  }
) {
  const {
    attemptRemoteSync = true,
    queueOnFailure = true,
    syncJobType,
    confusionIndexAvg = null,
  } = options;
  await persistActiveSession(session);

  let synced = false;

  if (attemptRemoteSync && hasSupabaseConfig) {
    try {
      await syncSessionToSupabase(session);
      synced = true;
    } catch (error) {
      if (queueOnFailure) {
        await enqueueSyncJob(
          syncJobType,
          session,
          error instanceof Error ? error.message : "Supabase sync failed."
        );
      }
    }
  } else if (queueOnFailure && hasSupabaseConfig) {
    await enqueueSyncJob(syncJobType, session);
  }

  await upsertRecentSessions([toRecentSession(session, synced, confusionIndexAvg)]);

  return session;
}

export async function getPersistedSession(sessionId?: string): Promise<SessionMeta | null> {
  const db = await getDatabase();

  const row = sessionId
    ? await db.getFirstAsync<ActiveSessionRow>(
        `
          SELECT *
          FROM active_session
          WHERE id = ?
          LIMIT 1;
        `,
        sessionId
      )
    : await db.getFirstAsync<ActiveSessionRow>(
        `
          SELECT *
          FROM active_session
          ORDER BY datetime(created_at) DESC
          LIMIT 1;
        `
      );

  return row ? normalizeSession(row) : null;
}

export async function createSession(
  payload: SessionCreatePayload,
  options: SessionMutationOptions & { teacherId: string }
): Promise<SessionMeta> {
  const joinCode = await generateUniqueJoinCode();
  const id = generateId("session");
  const createdAt = new Date().toISOString();

  const session: SessionMeta = {
    id,
    teacherId: options.teacherId,
    joinCode,
    qrPayload: buildJoinUrl(id, joinCode, payload.mode),
    subject: payload.subject.trim(),
    topic: payload.topic.trim(),
    gradeClass: payload.gradeClass.trim(),
    language: payload.language.trim(),
    lostThreshold: payload.lostThreshold,
    mode: payload.mode,
    lessonPlanSeed: payload.lessonPlanSeed?.trim() || undefined,
    status: "lobby",
    participantCount: 0,
    createdAt,
  };

  return saveSessionState(session, {
    ...options,
    syncJobType: "session_create",
  });
}

export async function updateSession(
  session: SessionMeta,
  updates: Partial<SessionMeta>,
  options: SessionMutationOptions = {}
): Promise<SessionMeta> {
  const nextSession: SessionMeta = {
    ...session,
    ...updates,
  };

  return saveSessionState(nextSession, {
    ...options,
    syncJobType: "session_update",
  });
}

export async function toggleSessionLock(
  session: SessionMeta,
  options: SessionMutationOptions = {}
) {
  return updateSession(
    session,
    {
      lockedAt: session.lockedAt ? undefined : new Date().toISOString(),
    },
    options
  );
}

export async function regenerateSessionJoinCode(
  session: SessionMeta,
  options: SessionMutationOptions = {}
) {
  const joinCode = await generateUniqueJoinCode(session.id);

  return updateSession(
    session,
    {
      joinCode,
      qrPayload: buildJoinUrl(session.id, joinCode, session.mode),
    },
    options
  );
}

export async function beginLiveSession(
  session: SessionMeta,
  options: SessionMutationOptions = {}
) {
  return updateSession(
    session,
    {
      status: "active",
      startedAt: session.startedAt ?? new Date().toISOString(),
    },
    options
  );
}

async function getAverageSessionConfusionIndex(sessionId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AverageRow>(
    `
      SELECT AVG(confusion_index) AS confusion_index_avg
      FROM local_pulse_cache
      WHERE session_id = ?;
    `,
    sessionId
  );

  return row?.confusion_index_avg ?? null;
}

export async function endLiveSession(
  session: SessionMeta,
  options: SessionMutationOptions = {}
) {
  const confusionIndexAvg = await getAverageSessionConfusionIndex(session.id);

  return saveSessionState(
    {
      ...session,
      status: "ended",
      endedAt: new Date().toISOString(),
    },
    {
      ...options,
      syncJobType: "session_update",
      confusionIndexAvg,
    }
  );
}

export async function countSessionParticipants(sessionId: string): Promise<number> {
  if (!hasSupabaseConfig) {
    return 0;
  }

  const { count, error } = await supabase
    .from(participantsTable)
    .select("*", { head: true, count: "exact" })
    .eq("session_id", sessionId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchRemoteSession(sessionId: string): Promise<SessionMeta | null> {
  if (!hasSupabaseConfig) {
    return null;
  }

  const { data, error } = await supabase
    .from(sessionsTable)
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return normalizeRemoteSession(data as UnknownRow);
}

export function subscribeToSessionLobby(
  sessionId: string,
  callbacks: SessionLobbySubscriptionCallbacks
) {
  if (!hasSupabaseConfig) {
    callbacks.onStatusChange?.("disabled");
    return () => undefined;
  }

  const refreshParticipants = async () => {
    try {
      const count = await countSessionParticipants(sessionId);
      callbacks.onParticipantCount?.(count);
    } catch (error) {
      callbacks.onError?.(
        error instanceof Error ? error.message : "Unable to refresh join count."
      );
    }
  };

  const channel = supabase.channel(`session-lobby:${sessionId}`);

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: sessionsTable,
      filter: `id=eq.${sessionId}`,
    },
    (payload) => {
      const nextSession = normalizeRemoteSession(payload.new as UnknownRow);
      if (nextSession) {
        callbacks.onSessionUpdated?.(nextSession);
      }
    }
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: participantsTable,
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      void refreshParticipants();
    }
  );

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      callbacks.onStatusChange?.("SUBSCRIBED");
      void refreshParticipants();
      return;
    }

    if (
      status === "TIMED_OUT" ||
      status === "CLOSED" ||
      status === "CHANNEL_ERROR"
    ) {
      callbacks.onStatusChange?.(status);
    }
  });

  return () => {
    void supabase.removeChannel(channel);
  };
}
