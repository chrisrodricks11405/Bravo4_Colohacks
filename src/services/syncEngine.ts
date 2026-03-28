import { getDatabase } from "../db";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import type {
  AnonymousQuestionPayload,
  InterventionActionPayload,
  LessonMarker,
  QuickPollPayload,
  SessionMeta,
  SessionSummaryPayload,
  SyncJob,
  SyncRunSnapshot,
} from "../types";
import { syncRecentSessionsFromSupabase } from "./recentSessions";
import { getPersistedSession } from "./session";
import { refreshQuestionClusters } from "./liveSession";
import { syncSessionSummariesFromSupabase } from "./summaries";
import {
  completeSyncJob,
  failSyncJob,
  getSyncQueueOverview,
  listDueSyncJobs,
  listSyncJobs,
  markSyncJobInProgress,
  retryFailedSyncJobs as resetFailedSyncJobs,
} from "./syncJobs";

type UnknownRow = Record<string, unknown>;

type PulseEventRow = {
  id: string;
  session_id: string;
  anonymous_id: string;
  pulse: string;
  timestamp: string;
};

type QuestionRow = {
  id: string;
  session_id: string;
  anonymous_id: string;
  text: string;
  language: string | null;
  lesson_marker_id: string | null;
  timestamp: string;
};

type LessonMarkerRow = {
  id: string;
  session_id: string;
  type: string;
  label: string | null;
  timestamp: string;
};

type InterventionRow = {
  id: string;
  session_id: string;
  type: string;
  cluster_id: string | null;
  lesson_marker_id: string | null;
  timestamp: string;
  confusion_before: number;
  confusion_after: number | null;
  recovery_score: number | null;
  recovery_window_seconds: number;
  duration_seconds: number | null;
  notes: string | null;
};

type PollResponseRow = {
  id: string;
  poll_id: string;
  session_id: string;
  anonymous_id: string;
  option_index: number;
  submitted_at: string;
};

const sessionsTable = process.env.EXPO_PUBLIC_SUPABASE_SESSIONS_TABLE ?? "sessions";
const recentSessionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_RECENT_SESSIONS_TABLE ?? "recent_sessions";
const pulseEventsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_PULSES_TABLE ?? "session_pulses";
const questionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_QUESTIONS_TABLE ?? "session_questions";
const clustersTable =
  process.env.EXPO_PUBLIC_SUPABASE_MISCONCEPTION_CLUSTERS_TABLE ??
  "misconception_clusters";
const interventionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_INTERVENTIONS_TABLE ??
  "session_interventions";
const pollsTable = process.env.EXPO_PUBLIC_SUPABASE_SESSION_POLLS_TABLE ?? "session_polls";
const pollResponsesTable =
  process.env.EXPO_PUBLIC_SUPABASE_POLL_RESPONSES_TABLE ?? "poll_responses";
const sessionSummariesTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_SUMMARIES_TABLE ?? "session_summaries";
const lessonMarkersTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_LESSON_MARKERS_TABLE ??
  "session_lesson_markers";

const MAX_BACKOFF_MS = 30 * 60 * 1000;
const BASE_BACKOFF_MS = 5_000;

export interface RunSyncEngineOptions {
  userId?: string;
  limit?: number;
  onProgress?: (snapshot: SyncRunSnapshot) => void;
}

export interface RunSyncEngineResult {
  processedJobs: number;
  failedJobs: number;
  overview: Awaited<ReturnType<typeof getSyncQueueOverview>>;
}

function getBackoffMs(retryCount: number) {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(retryCount, 0), MAX_BACKOFF_MS);
}

function toNextAttemptAt(retryCount: number) {
  return new Date(Date.now() + getBackoffMs(retryCount)).toISOString();
}

function parsePayload<T>(payload: string): T {
  return JSON.parse(payload) as T;
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

function pollToRemoteRow(poll: QuickPollPayload) {
  return {
    id: poll.id,
    session_id: poll.sessionId,
    question: poll.question,
    options_json: poll.options,
    correct_option_index: poll.correctOptionIndex ?? null,
    source: poll.source,
    cluster_id: poll.clusterId ?? null,
    cluster_title: poll.clusterTitle ?? null,
    rationale: poll.rationale ?? null,
    status: poll.status,
    created_at: poll.createdAt,
    updated_at: poll.updatedAt,
    pushed_at: poll.pushedAt ?? null,
    closed_at: poll.closedAt ?? null,
  };
}

function interventionToRemoteRow(intervention: InterventionActionPayload) {
  return {
    id: intervention.id,
    session_id: intervention.sessionId,
    type: intervention.type,
    cluster_id: intervention.clusterId ?? null,
    lesson_marker_id: intervention.lessonMarkerId ?? null,
    timestamp: intervention.timestamp,
    confusion_before: intervention.confusionBefore,
    confusion_after: intervention.confusionAfter ?? null,
    recovery_score: intervention.recoveryScore ?? null,
    recovery_window_seconds: intervention.recoveryWindowSeconds,
    duration_seconds: intervention.durationSeconds ?? null,
    notes: intervention.notes ?? null,
  };
}

async function markRowsSynced(tableName: string, ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  const placeholders = ids.map(() => "?").join(", ");

  await db.runAsync(
    `
      UPDATE ${tableName}
      SET synced = 1,
          synced_at = ?
      WHERE id IN (${placeholders});
    `,
    now,
    ...ids
  );
}

async function markRecentSessionSynced(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `
      UPDATE recent_sessions
      SET synced = 1
      WHERE id = ?;
    `,
    sessionId
  );
}

async function markSessionSummarySynced(sessionId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `
      UPDATE session_summaries
      SET synced = 1,
          updated_at = CASE
            WHEN updated_at IS NULL OR updated_at = '' THEN ?
            ELSE updated_at
          END
      WHERE session_id = ?;
    `,
    now,
    sessionId
  );
}

async function listUnsyncedPulseEvents(sessionId: string): Promise<PulseEventRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<PulseEventRow>(
    `
      SELECT id, session_id, anonymous_id, pulse, timestamp
      FROM local_pulse_events
      WHERE session_id = ?
        AND synced = 0
      ORDER BY datetime(timestamp) ASC;
    `,
    sessionId
  );
}

async function listUnsyncedQuestions(sessionId: string): Promise<QuestionRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<QuestionRow>(
    `
      SELECT id, session_id, anonymous_id, text, language, lesson_marker_id, timestamp
      FROM question_cache
      WHERE session_id = ?
        AND synced = 0
      ORDER BY datetime(timestamp) ASC;
    `,
    sessionId
  );
}

async function listUnsyncedLessonMarkers(sessionId: string): Promise<LessonMarkerRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<LessonMarkerRow>(
    `
      SELECT id, session_id, type, label, timestamp
      FROM lesson_markers
      WHERE session_id = ?
        AND synced = 0
      ORDER BY datetime(timestamp) ASC;
    `,
    sessionId
  );
}

async function listUnsyncedPollResponses(sessionId: string): Promise<PollResponseRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<PollResponseRow>(
    `
      SELECT id, poll_id, session_id, anonymous_id, option_index, submitted_at
      FROM poll_response_cache
      WHERE session_id = ?
        AND synced = 0
      ORDER BY datetime(submitted_at) ASC;
    `,
    sessionId
  );
}

async function upsertRemoteRecentSession(session: SessionMeta): Promise<void> {
  try {
    const db = await getDatabase();
    const localRecent = await db.getFirstAsync<{
      confusion_index_avg: number | null;
    }>(
      `
        SELECT confusion_index_avg
        FROM recent_sessions
        WHERE id = ?
        LIMIT 1;
      `,
      session.id
    );

    const { error } = await supabase.from(recentSessionsTable).upsert(
      {
        id: session.id,
        teacher_id: session.teacherId,
        subject: session.subject,
        topic: session.topic,
        grade_class: session.gradeClass,
        status: session.status,
        participant_count: session.participantCount,
        created_at: session.createdAt,
        ended_at: session.endedAt ?? null,
        confusion_index_avg: localRecent?.confusion_index_avg ?? null,
        synced: true,
      },
      { onConflict: "id" }
    );

    if (error) {
      throw error;
    }
  } catch {
    // Keep session sync resilient even if the archive table is unavailable.
  }
}

async function handleSessionJob(job: SyncJob): Promise<void> {
  const session = parsePayload<SessionMeta>(job.payload);
  const { error } = await supabase
    .from(sessionsTable)
    .upsert(sessionToRemoteRow(session), { onConflict: "id" });

  if (error) {
    throw error;
  }

  await upsertRemoteRecentSession(session);
  await markRecentSessionSynced(session.id);
}

async function handlePulseBatchJob(job: SyncJob): Promise<void> {
  const payload = parsePayload<{ sessionId?: string }>(job.payload);
  const sessionId = payload.sessionId ?? job.sessionId;

  if (!sessionId) {
    return;
  }

  const events = await listUnsyncedPulseEvents(sessionId);
  if (events.length === 0) {
    return;
  }

  const remoteRows = events.map((event) => ({
    id: event.id,
    session_id: event.session_id,
    anonymous_id: event.anonymous_id,
    pulse: event.pulse,
    timestamp: event.timestamp,
  }));

  const { error } = await supabase
    .from(pulseEventsTable)
    .upsert(remoteRows, { onConflict: "id" });

  if (error) {
    throw error;
  }

  await markRowsSynced(
    "local_pulse_events",
    events.map((event) => event.id)
  );
}

async function handleQuestionBatchJob(job: SyncJob): Promise<void> {
  const payload = parsePayload<{ sessionId?: string }>(job.payload);
  const sessionId = payload.sessionId ?? job.sessionId;

  if (!sessionId) {
    return;
  }

  const questions = await listUnsyncedQuestions(sessionId);
  if (questions.length === 0) {
    return;
  }

  const remoteRows = questions.map((question) => ({
    id: question.id,
    session_id: question.session_id,
    anonymous_id: question.anonymous_id,
    text: question.text,
    language: question.language,
    lesson_marker_id: question.lesson_marker_id,
    timestamp: question.timestamp,
  }));

  const { error } = await supabase
    .from(questionsTable)
    .upsert(remoteRows, { onConflict: "id" });

  if (error) {
    throw error;
  }

  await markRowsSynced(
    "question_cache",
    questions.map((question) => question.id)
  );

  const session = await getPersistedSession(sessionId);
  await refreshQuestionClusters({
    sessionId,
    session,
    force: true,
    preferLocal: false,
  });
}

async function handleClusterUpdateJob(job: SyncJob): Promise<void> {
  const payload = parsePayload<{
    sessionId: string;
    clusterId: string;
    status: string;
    updatedAt?: string;
  }>(job.payload);

  const { error } = await supabase
    .from(clustersTable)
    .update({
      status: payload.status,
      updated_at: payload.updatedAt ?? new Date().toISOString(),
    })
    .eq("session_id", payload.sessionId)
    .eq("id", payload.clusterId);

  if (error) {
    throw error;
  }
}

async function handleInterventionJob(job: SyncJob): Promise<void> {
  const intervention = parsePayload<InterventionActionPayload>(job.payload);
  const { error } = await supabase
    .from(interventionsTable)
    .upsert(interventionToRemoteRow(intervention), { onConflict: "id" });

  if (error) {
    throw error;
  }

  await markRowsSynced("intervention_history", [intervention.id]);
}

async function handlePollCreateJob(job: SyncJob): Promise<void> {
  const poll = parsePayload<QuickPollPayload>(job.payload);
  const { error } = await supabase
    .from(pollsTable)
    .upsert(pollToRemoteRow(poll), { onConflict: "id" });

  if (error) {
    throw error;
  }

  await markRowsSynced("poll_cache", [poll.id]);
}

async function handlePollResultJob(job: SyncJob): Promise<void> {
  const payload = parsePayload<{ sessionId?: string; id?: string }>(job.payload);
  const sessionId = payload.sessionId ?? job.sessionId;

  if (!sessionId) {
    return;
  }

  const responses = await listUnsyncedPollResponses(sessionId);
  if (responses.length === 0) {
    return;
  }

  const remoteRows = responses.map((response) => ({
    id: response.id,
    poll_id: response.poll_id,
    session_id: response.session_id,
    anonymous_id: response.anonymous_id,
    option_index: response.option_index,
    submitted_at: response.submitted_at,
  }));

  const { error } = await supabase
    .from(pollResponsesTable)
    .upsert(remoteRows, { onConflict: "id" });

  if (error) {
    throw error;
  }

  await markRowsSynced(
    "poll_response_cache",
    responses.map((response) => response.id)
  );
}

async function handleSummaryJob(job: SyncJob): Promise<void> {
  const payload = parsePayload<Record<string, unknown>>(job.payload);
  const { error } = await supabase
    .from(sessionSummariesTable)
    .upsert(payload, { onConflict: "session_id" });

  if (error) {
    throw error;
  }

  const sessionId =
    typeof payload.session_id === "string"
      ? payload.session_id
      : typeof payload.sessionId === "string"
        ? payload.sessionId
        : null;

  if (sessionId) {
    await markSessionSummarySynced(sessionId);
  }
}

async function handleLessonMarkerJob(job: SyncJob): Promise<void> {
  const marker = parsePayload<LessonMarker>(job.payload);
  const { error } = await supabase
    .from(lessonMarkersTable)
    .upsert(
      {
        id: marker.id,
        session_id: marker.sessionId,
        type: marker.type,
        label: marker.label ?? null,
        timestamp: marker.timestamp,
      },
      { onConflict: "id" }
    );

  if (error) {
    throw error;
  }

  await markRowsSynced("lesson_markers", [marker.id]);
}

async function processJob(job: SyncJob): Promise<void> {
  switch (job.type) {
    case "session_create":
    case "session_update":
      await handleSessionJob(job);
      return;
    case "pulse_batch":
      await handlePulseBatchJob(job);
      return;
    case "question_batch":
      await handleQuestionBatchJob(job);
      return;
    case "cluster_update":
      await handleClusterUpdateJob(job);
      return;
    case "intervention":
      await handleInterventionJob(job);
      return;
    case "poll_create":
      await handlePollCreateJob(job);
      return;
    case "poll_result":
      await handlePollResultJob(job);
      return;
    case "summary":
      await handleSummaryJob(job);
      return;
    case "lesson_marker":
      await handleLessonMarkerJob(job);
      return;
    default:
      return;
  }
}

export async function runSyncEngine(
  options: RunSyncEngineOptions = {}
): Promise<RunSyncEngineResult> {
  if (!hasSupabaseConfig) {
    return {
      processedJobs: 0,
      failedJobs: 0,
      overview: await getSyncQueueOverview(),
    };
  }

  const jobs = await listDueSyncJobs(options.limit ?? 20);
  const totalJobs = jobs.length;
  let completedJobs = 0;
  let failedJobs = 0;

  options.onProgress?.({
    totalJobs,
    completedJobs: 0,
    failedJobs: 0,
    progress: totalJobs === 0 ? 100 : 0,
    activeJobLabel: totalJobs > 0 ? jobs[0]?.type : undefined,
  });

  for (const job of jobs) {
    await markSyncJobInProgress(job.id);

    try {
      await processJob(job);
      await completeSyncJob(job.id);
      completedJobs += 1;
    } catch (error) {
      failedJobs += 1;
      await failSyncJob(
        job.id,
        error instanceof Error ? error.message : "Sync job failed.",
        toNextAttemptAt(job.retryCount + 1)
      );
    }

    options.onProgress?.({
      totalJobs,
      completedJobs: completedJobs + failedJobs,
      failedJobs,
      progress:
        totalJobs <= 0
          ? 100
          : Math.min(100, Math.round(((completedJobs + failedJobs) / totalJobs) * 100)),
      activeJobLabel: job.type,
    });
  }

  if (completedJobs > 0 && options.userId) {
    try {
      await Promise.all([
        syncRecentSessionsFromSupabase(options.userId, 20),
        syncSessionSummariesFromSupabase(options.userId, 40),
      ]);
    } catch {
      // Queue processing should still succeed even if aggregate refresh is unavailable.
    }
  }

  return {
    processedJobs: completedJobs,
    failedJobs,
    overview: await getSyncQueueOverview(),
  };
}

export async function retryFailedSyncJobs(
  options: RunSyncEngineOptions = {}
): Promise<RunSyncEngineResult> {
  await resetFailedSyncJobs();
  return runSyncEngine(options);
}

export async function exportSyncDiagnostics(limit = 40): Promise<string> {
  const [overview, jobs, activeSession] = await Promise.all([
    getSyncQueueOverview(),
    listSyncJobs({ limit }),
    getPersistedSession(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    activeSession,
    overview,
    jobs,
  };

  return JSON.stringify(payload, null, 2);
}
