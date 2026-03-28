import { getDatabase } from "../db";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { queueSyncJob } from "./syncJobs";
import type {
  PollDistributionSnapshot,
  PollOption,
  PollResponsePayload,
  PollStatus,
  QuickPollDraftInput,
  QuickPollPayload,
  SyncJobType,
} from "../types";

type UnknownRow = Record<string, unknown>;

type PollRow = {
  id: string;
  session_id: string;
  question: string;
  options_json: string;
  correct_option_index: number | null;
  source: string;
  cluster_id: string | null;
  cluster_title: string | null;
  rationale: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  closed_at: string | null;
  synced: number;
  synced_at?: string | null;
};

type PollResponseRow = {
  id: string;
  poll_id: string;
  session_id: string;
  anonymous_id: string;
  option_index: number;
  submitted_at: string;
  synced?: number;
  synced_at?: string | null;
};

type PollMutationOptions = {
  attemptRemoteSync?: boolean;
  queueOnFailure?: boolean;
  syncJobType?: SyncJobType;
};

interface PollSessionSubscriptionCallbacks {
  onPollEvent?: () => void;
  onResponseEvent?: () => void;
  onBroadcastEvent?: (event: "poll_push" | "poll_close", payload: unknown) => void;
  onStatusChange?: (status: PollChannelStatus) => void;
}

export type PollChannelStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "disabled";

const pollsTable = process.env.EXPO_PUBLIC_SUPABASE_SESSION_POLLS_TABLE ?? "session_polls";
const pollResponsesTable =
  process.env.EXPO_PUBLIC_SUPABASE_POLL_RESPONSES_TABLE ?? "poll_responses";

const UPSERT_POLL_SQL = `
  INSERT INTO poll_cache (
    id,
    session_id,
    question,
    options_json,
    correct_option_index,
    source,
    cluster_id,
    cluster_title,
    rationale,
    status,
    created_at,
    updated_at,
    pushed_at,
    closed_at,
    synced,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    question = excluded.question,
    options_json = excluded.options_json,
    correct_option_index = excluded.correct_option_index,
    source = excluded.source,
    cluster_id = excluded.cluster_id,
    cluster_title = excluded.cluster_title,
    rationale = excluded.rationale,
    status = excluded.status,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    pushed_at = excluded.pushed_at,
    closed_at = excluded.closed_at,
    synced = excluded.synced,
    synced_at = excluded.synced_at;
`;

const UPSERT_POLL_RESPONSE_SQL = `
  INSERT INTO poll_response_cache (
    id,
    poll_id,
    session_id,
    anonymous_id,
    option_index,
    submitted_at,
    synced,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    poll_id = excluded.poll_id,
    session_id = excluded.session_id,
    anonymous_id = excluded.anonymous_id,
    option_index = excluded.option_index,
    submitted_at = excluded.submitted_at,
    synced = excluded.synced,
    synced_at = excluded.synced_at;
`;

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function getPollChannelName(sessionId: string) {
  return `session-polls:${sessionId}`;
}

function toIsoString(value?: string | null) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizePollStatus(value: string | null): PollStatus {
  switch (value) {
    case "draft":
    case "active":
    case "closed":
      return value;
    default:
      return "draft";
  }
}

function readString(row: UnknownRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function readNumber(row: UnknownRow, ...keys: string[]) {
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

function validatePollOptions(options: string[]) {
  const trimmedOptions = options
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

  if (trimmedOptions.length < 2 || trimmedOptions.length > 4) {
    throw new Error("Quick polls need between 2 and 4 answer options.");
  }

  return trimmedOptions;
}

function toPollOptions(options: string[]): PollOption[] {
  return validatePollOptions(options).map((text, index) => ({ index, text }));
}

function parsePollOptions(value: unknown): PollOption[] {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry, index) => {
        if (typeof entry === "string") {
          return { index, text: entry };
        }

        if (entry && typeof entry === "object") {
          const maybeEntry = entry as Record<string, unknown>;
          const text = typeof maybeEntry.text === "string" ? maybeEntry.text.trim() : "";
          const optionIndex =
            typeof maybeEntry.index === "number" && Number.isFinite(maybeEntry.index)
              ? maybeEntry.index
              : index;

          if (text.length > 0) {
            return {
              index: optionIndex,
              text,
            };
          }
        }

        return null;
      })
      .filter((entry): entry is PollOption => Boolean(entry));

    return normalized.sort((left, right) => left.index - right.index);
  }

  if (typeof value === "string") {
    try {
      return parsePollOptions(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function normalizePollRow(row: PollRow): QuickPollPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    question: row.question,
    options: parsePollOptions(row.options_json),
    correctOptionIndex: row.correct_option_index ?? undefined,
    source: row.source === "ai_generated" ? "ai_generated" : "manual",
    clusterId: row.cluster_id ?? undefined,
    clusterTitle: row.cluster_title ?? undefined,
    rationale: row.rationale ?? undefined,
    status: normalizePollStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pushedAt: row.pushed_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
  };
}

function normalizeRemotePoll(row: UnknownRow): QuickPollPayload | null {
  const id = readString(row, "id");
  const sessionId = readString(row, "session_id", "sessionId");
  const question = readString(row, "question");
  const createdAt = readString(row, "created_at", "createdAt");
  const updatedAt = readString(row, "updated_at", "updatedAt");

  if (!id || !sessionId || !question || !createdAt || !updatedAt) {
    return null;
  }

  const options =
    parsePollOptions(row.options_json) ??
    parsePollOptions(row.options) ??
    parsePollOptions(row.option_list);

  return {
    id,
    sessionId,
    question,
    options,
    correctOptionIndex:
      readNumber(row, "correct_option_index", "correctOptionIndex") ?? undefined,
    source: readString(row, "source") === "ai_generated" ? "ai_generated" : "manual",
    clusterId: readString(row, "cluster_id", "clusterId") ?? undefined,
    clusterTitle: readString(row, "cluster_title", "clusterTitle") ?? undefined,
    rationale: readString(row, "rationale") ?? undefined,
    status: normalizePollStatus(readString(row, "status")),
    createdAt: toIsoString(createdAt),
    updatedAt: toIsoString(updatedAt),
    pushedAt: readString(row, "pushed_at", "pushedAt") ?? undefined,
    closedAt: readString(row, "closed_at", "closedAt") ?? undefined,
  };
}

function normalizePollResponseRow(row: PollResponseRow): PollResponsePayload {
  return {
    id: row.id,
    pollId: row.poll_id,
    sessionId: row.session_id,
    anonymousId: row.anonymous_id,
    optionIndex: row.option_index,
    submittedAt: row.submitted_at,
  };
}

function normalizeRemotePollResponse(row: UnknownRow): PollResponsePayload | null {
  const id = readString(row, "id");
  const pollId = readString(row, "poll_id", "pollId");
  const sessionId = readString(row, "session_id", "sessionId");
  const anonymousId = readString(row, "anonymous_id", "anonymousId", "student_id", "studentId");
  const submittedAt = readString(row, "submitted_at", "submittedAt", "created_at", "createdAt");
  const optionIndex = readNumber(row, "option_index", "optionIndex");

  if (!id || !pollId || !sessionId || !anonymousId || !submittedAt || optionIndex == null) {
    return null;
  }

  return {
    id,
    pollId,
    sessionId,
    anonymousId,
    optionIndex,
    submittedAt: toIsoString(submittedAt),
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

async function enqueueSyncJob(
  type: SyncJobType,
  payload: QuickPollPayload | PollResponsePayload,
  errorMessage?: string
) {
  await queueSyncJob({
    type,
    payload,
    sessionId: payload.sessionId,
    jobKey:
      type === "poll_result"
        ? `poll_result:${payload.sessionId}`
        : `poll:${payload.id}`,
    errorMessage,
    dedupe: type === "poll_result" ? "ignore" : "replace",
  });
}

async function persistPoll(poll: QuickPollPayload, synced: boolean) {
  const db = await getDatabase();
  const syncedAt = synced ? new Date().toISOString() : null;

  await db.runAsync(
    UPSERT_POLL_SQL,
    poll.id,
    poll.sessionId,
    poll.question,
    JSON.stringify(poll.options),
    poll.correctOptionIndex ?? null,
    poll.source,
    poll.clusterId ?? null,
    poll.clusterTitle ?? null,
    poll.rationale ?? null,
    poll.status,
    poll.createdAt,
    poll.updatedAt,
    poll.pushedAt ?? null,
    poll.closedAt ?? null,
    synced ? 1 : 0,
    syncedAt
  );
}

async function upsertRemotePoll(poll: QuickPollPayload) {
  const { error } = await supabase.from(pollsTable).upsert(pollToRemoteRow(poll));

  if (error) {
    throw error;
  }
}

async function savePoll(
  poll: QuickPollPayload,
  options: PollMutationOptions = {}
): Promise<QuickPollPayload> {
  const {
    attemptRemoteSync = false,
    queueOnFailure = true,
    syncJobType = "poll_create",
  } = options;

  await persistPoll(poll, false);

  if (attemptRemoteSync && hasSupabaseConfig) {
    try {
      await upsertRemotePoll(poll);
      await persistPoll(poll, true);
    } catch (error) {
      if (queueOnFailure) {
        await enqueueSyncJob(
          syncJobType,
          poll,
          error instanceof Error ? error.message : "Poll sync failed."
        );
      }
    }
  } else if (queueOnFailure && hasSupabaseConfig) {
    await enqueueSyncJob(syncJobType, poll, "Queued while the device is offline.");
  }

  return poll;
}

async function fetchRemotePolls(sessionId: string): Promise<QuickPollPayload[]> {
  const { data, error } = await supabase
    .from(pollsTable)
    .select("*")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false })
    .limit(32);

  if (error) {
    throw error;
  }

  return ((data as UnknownRow[] | null) ?? [])
    .map((row) => normalizeRemotePoll(row))
    .filter((row): row is QuickPollPayload => Boolean(row));
}

async function fetchRemotePollResponses(
  sessionId: string,
  pollId?: string
): Promise<PollResponsePayload[]> {
  let query = supabase
    .from(pollResponsesTable)
    .select("*")
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: false })
    .limit(400);

  if (pollId) {
    query = query.eq("poll_id", pollId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data as UnknownRow[] | null) ?? [])
    .map((row) => normalizeRemotePollResponse(row))
    .filter((row): row is PollResponsePayload => Boolean(row));
}

async function broadcastPollEvent(
  sessionId: string,
  event: "poll_push" | "poll_close",
  payload: unknown
) {
  if (!hasSupabaseConfig) {
    return;
  }

  const channel = supabase.channel(getPollChannelName(sessionId), {
    config: {
      broadcast: {
        ack: true,
        self: true,
      },
    },
  });

  try {
    await channel.httpSend(event, payload);
  } finally {
    void supabase.removeChannel(channel);
  }
}

function sortPolls(polls: QuickPollPayload[]) {
  const statusWeight: Record<PollStatus, number> = {
    active: 0,
    draft: 1,
    closed: 2,
  };

  return [...polls].sort((left, right) => {
    if (statusWeight[left.status] !== statusWeight[right.status]) {
      return statusWeight[left.status] - statusWeight[right.status];
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

async function closeSiblingPolls(
  sessionId: string,
  keepPollId: string,
  options: PollMutationOptions
) {
  const localPolls = await listCachedPolls(sessionId);
  const activeSiblings = localPolls.filter(
    (poll) => poll.status === "active" && poll.id !== keepPollId
  );

  if (activeSiblings.length === 0) {
    return;
  }

  const closedAt = new Date().toISOString();

  for (const poll of activeSiblings) {
    const nextPoll: QuickPollPayload = {
      ...poll,
      status: "closed",
      updatedAt: closedAt,
      closedAt,
    };

    await savePoll(nextPoll, {
      ...options,
      syncJobType: "poll_create",
    });

    if (options.attemptRemoteSync && hasSupabaseConfig) {
      await broadcastPollEvent(sessionId, "poll_close", {
        pollId: nextPoll.id,
        sessionId,
      });
    }
  }
}

export async function persistPolls(
  polls: QuickPollPayload[],
  synced = false
): Promise<void> {
  for (const poll of polls) {
    await persistPoll(poll, synced);
  }
}

export async function persistPollResponses(
  responses: PollResponsePayload[],
  synced = true
): Promise<void> {
  if (responses.length === 0) {
    return;
  }

  const db = await getDatabase();
  const syncedAt = synced ? new Date().toISOString() : null;

  for (const response of responses) {
    await db.runAsync(
      UPSERT_POLL_RESPONSE_SQL,
      response.id,
      response.pollId,
      response.sessionId,
      response.anonymousId,
      response.optionIndex,
      response.submittedAt,
      synced ? 1 : 0,
      syncedAt
    );
  }
}

export async function recordLocalPollResponse(
  response: PollResponsePayload
): Promise<void> {
  await persistPollResponses([response], false);

  if (hasSupabaseConfig) {
    await enqueueSyncJob(
      "poll_result",
      response,
      "Queued while the device is offline."
    );
  }
}

export async function listCachedPolls(
  sessionId: string,
  limit = 24
): Promise<QuickPollPayload[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PollRow>(
    `
      SELECT
        id,
        session_id,
        question,
        options_json,
        correct_option_index,
        source,
        cluster_id,
        cluster_title,
        rationale,
        status,
        created_at,
        updated_at,
        pushed_at,
        closed_at,
        synced
      FROM poll_cache
      WHERE session_id = ?
      ORDER BY datetime(updated_at) DESC
      LIMIT ?;
    `,
    sessionId,
    limit
  );

  return sortPolls(rows.map((row) => normalizePollRow(row)));
}

export async function listCachedPollResponses(
  pollId: string
): Promise<PollResponsePayload[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PollResponseRow>(
    `
      SELECT
        id,
        poll_id,
        session_id,
        anonymous_id,
        option_index,
        submitted_at
      FROM poll_response_cache
      WHERE poll_id = ?
      ORDER BY datetime(submitted_at) DESC;
    `,
    pollId
  );

  return rows.map((row) => normalizePollResponseRow(row));
}

export function computePollDistribution(
  poll: QuickPollPayload,
  responses: PollResponsePayload[]
): PollDistributionSnapshot {
  const latestResponseByStudent = new Map<string, PollResponsePayload>();

  [...responses]
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .forEach((response) => {
      if (!latestResponseByStudent.has(response.anonymousId)) {
        latestResponseByStudent.set(response.anonymousId, response);
      }
    });

  const latestResponses = [...latestResponseByStudent.values()];
  const totalResponses = latestResponses.length;

  const distribution = poll.options.map((option) => {
    const count = latestResponses.filter(
      (response) => response.optionIndex === option.index
    ).length;

    return {
      optionIndex: option.index,
      count,
      percent:
        totalResponses === 0 ? 0 : Math.round((count / totalResponses) * 1000) / 10,
    };
  });

  const leadingOption = [...distribution].sort(
    (left, right) => right.count - left.count || left.optionIndex - right.optionIndex
  )[0];

  return {
    pollId: poll.id,
    sessionId: poll.sessionId,
    timestamp: new Date().toISOString(),
    totalResponses,
    distribution,
    leadingOptionIndex:
      totalResponses > 0 && leadingOption ? leadingOption.optionIndex : undefined,
  };
}

export async function getPollDistribution(
  poll: QuickPollPayload
): Promise<PollDistributionSnapshot> {
  const responses = await listCachedPollResponses(poll.id);
  return computePollDistribution(poll, responses);
}

export async function refreshPollHistory(
  sessionId: string
): Promise<QuickPollPayload[]> {
  if (!hasSupabaseConfig) {
    return listCachedPolls(sessionId);
  }

  const remotePolls = await fetchRemotePolls(sessionId);
  if (remotePolls.length > 0) {
    await persistPolls(remotePolls, true);
  }

  return listCachedPolls(sessionId);
}

export async function refreshPollResponses(
  sessionId: string,
  pollId?: string
): Promise<PollResponsePayload[]> {
  if (!hasSupabaseConfig) {
    return pollId ? listCachedPollResponses(pollId) : [];
  }

  const remoteResponses = await fetchRemotePollResponses(sessionId, pollId);
  if (remoteResponses.length > 0) {
    await persistPollResponses(remoteResponses);
  }

  return pollId ? listCachedPollResponses(pollId) : remoteResponses;
}

export async function createPollDraft(
  sessionId: string,
  input: QuickPollDraftInput,
  options: PollMutationOptions = {}
): Promise<QuickPollPayload> {
  const timestamp = new Date().toISOString();

  const draft: QuickPollPayload = {
    id: generateId("poll"),
    sessionId,
    question: input.question.trim(),
    options: toPollOptions(input.options),
    correctOptionIndex: input.correctOptionIndex,
    source: input.source,
    clusterId: input.clusterId,
    clusterTitle: input.clusterTitle,
    rationale: input.rationale,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (!draft.question) {
    throw new Error("Poll question cannot be empty.");
  }

  return savePoll(draft, {
    ...options,
    syncJobType: "poll_create",
  });
}

export async function updatePollDraft(
  pollId: string,
  input: QuickPollDraftInput,
  options: PollMutationOptions = {}
): Promise<QuickPollPayload> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PollRow>(
    `
      SELECT
        id,
        session_id,
        question,
        options_json,
        correct_option_index,
        source,
        cluster_id,
        cluster_title,
        rationale,
        status,
        created_at,
        updated_at,
        pushed_at,
        closed_at,
        synced
      FROM poll_cache
      WHERE id = ?
      LIMIT 1;
    `,
    pollId
  );

  if (!row) {
    throw new Error("Draft poll not found.");
  }

  const existing = normalizePollRow(row);
  if (existing.status !== "draft") {
    throw new Error("Only draft polls can be edited.");
  }

  const nextPoll: QuickPollPayload = {
    ...existing,
    question: input.question.trim(),
    options: toPollOptions(input.options),
    correctOptionIndex: input.correctOptionIndex,
    source: input.source,
    clusterId: input.clusterId,
    clusterTitle: input.clusterTitle,
    rationale: input.rationale,
    updatedAt: new Date().toISOString(),
  };

  if (!nextPoll.question) {
    throw new Error("Poll question cannot be empty.");
  }

  return savePoll(nextPoll, {
    ...options,
    syncJobType: "poll_create",
  });
}

export async function pushPoll(
  pollId: string,
  options: PollMutationOptions = {}
): Promise<QuickPollPayload> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PollRow>(
    `
      SELECT
        id,
        session_id,
        question,
        options_json,
        correct_option_index,
        source,
        cluster_id,
        cluster_title,
        rationale,
        status,
        created_at,
        updated_at,
        pushed_at,
        closed_at,
        synced
      FROM poll_cache
      WHERE id = ?
      LIMIT 1;
    `,
    pollId
  );

  if (!row) {
    throw new Error("Poll not found.");
  }

  const existing = normalizePollRow(row);
  await closeSiblingPolls(existing.sessionId, existing.id, options);

  const timestamp = new Date().toISOString();
  const nextPoll: QuickPollPayload = {
    ...existing,
    status: "active",
    updatedAt: timestamp,
    pushedAt: existing.pushedAt ?? timestamp,
    closedAt: undefined,
  };

  await savePoll(nextPoll, {
    ...options,
    syncJobType: "poll_create",
  });

  if (options.attemptRemoteSync && hasSupabaseConfig) {
    await broadcastPollEvent(existing.sessionId, "poll_push", {
      poll: nextPoll,
    });
  }

  return nextPoll;
}

export async function closePoll(
  pollId: string,
  options: PollMutationOptions = {}
): Promise<QuickPollPayload> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PollRow>(
    `
      SELECT
        id,
        session_id,
        question,
        options_json,
        correct_option_index,
        source,
        cluster_id,
        cluster_title,
        rationale,
        status,
        created_at,
        updated_at,
        pushed_at,
        closed_at,
        synced
      FROM poll_cache
      WHERE id = ?
      LIMIT 1;
    `,
    pollId
  );

  if (!row) {
    throw new Error("Poll not found.");
  }

  const existing = normalizePollRow(row);
  const timestamp = new Date().toISOString();
  const nextPoll: QuickPollPayload = {
    ...existing,
    status: "closed",
    updatedAt: timestamp,
    closedAt: existing.closedAt ?? timestamp,
  };

  await savePoll(nextPoll, {
    ...options,
    syncJobType: "poll_create",
  });

  if (options.attemptRemoteSync && hasSupabaseConfig) {
    await broadcastPollEvent(existing.sessionId, "poll_close", {
      pollId: nextPoll.id,
      sessionId: nextPoll.sessionId,
    });
  }

  return nextPoll;
}

export function subscribeToPollSession(
  sessionId: string,
  callbacks: PollSessionSubscriptionCallbacks
) {
  if (!hasSupabaseConfig) {
    callbacks.onStatusChange?.("disabled");
    return () => undefined;
  }

  const channel = supabase.channel(getPollChannelName(sessionId), {
    config: {
      broadcast: {
        self: true,
      },
    },
  });

  channel.on("broadcast", { event: "poll_push" }, (payload) => {
    callbacks.onBroadcastEvent?.("poll_push", payload);
  });

  channel.on("broadcast", { event: "poll_close" }, (payload) => {
    callbacks.onBroadcastEvent?.("poll_close", payload);
  });

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: pollsTable,
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      callbacks.onPollEvent?.();
    }
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: pollResponsesTable,
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      callbacks.onResponseEvent?.();
    }
  );

  channel.subscribe((status) => {
    if (
      status === "SUBSCRIBED" ||
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
