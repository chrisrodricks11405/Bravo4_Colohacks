import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { addMonitoringBreadcrumb } from "../lib/monitoring";
import { sanitizeText } from "../lib/sanitization";

type UnknownRow = Record<string, unknown>;
type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

export type SessionAnnouncementRecord = {
  id: string;
  sessionId: string;
  title?: string;
  body: string;
  type: "text" | "voice";
  audioUrl?: string;
  issuedAt: string;
};

export type StudentReactionRecord = {
  id: string;
  sessionId: string;
  anonymousId: string;
  emoji: "thumbs_up" | "lightbulb" | "question" | "clap";
  createdAt: string;
};

export type EngagementLeaderboardEntry = {
  anonymousId: string;
  score: number;
  questions: number;
  pollResponses: number;
  reactions: number;
  heartbeats: number;
};

export type SessionEngagementSnapshot = {
  activeCount: number;
  disconnectedCount: number;
  engagementScore: number;
  averageScreenSeconds: number;
  signalMix: {
    gotIt: number;
    sortOf: number;
    lost: number;
    silent: number;
  };
  leaderboard: EngagementLeaderboardEntry[];
};

interface AnnouncementSubscriptionCallbacks {
  onAnnouncementEvent?: () => void;
  onStatusChange?: (status: AnnouncementChannelStatus) => void;
}

interface EngagementSubscriptionCallbacks {
  onReactionEvent?: () => void;
  onHeartbeatEvent?: () => void;
  onStatusChange?: (status: EngagementChannelStatus) => void;
}

export type AnnouncementChannelStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "disabled";

export type EngagementChannelStatus = AnnouncementChannelStatus;

const announcementsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_ANNOUNCEMENTS_TABLE ??
  "session_announcements";
const reactionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_STUDENT_REACTIONS_TABLE ?? "student_reactions";
const heartbeatsTable =
  process.env.EXPO_PUBLIC_SUPABASE_STUDENT_HEARTBEATS_TABLE ?? "student_heartbeats";
const pollResponsesTable =
  process.env.EXPO_PUBLIC_SUPABASE_POLL_RESPONSES_TABLE ?? "poll_responses";
const questionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_QUESTIONS_TABLE ?? "session_questions";
const participantsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_PARTICIPANTS_TABLE ?? "session_participants";
const unavailableOptionalTables = new Set<string>();

function normalizeErrorMessage(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function isMissingTableError(error: unknown, tableName: string) {
  const candidate = (error ?? {}) as SupabaseErrorLike;
  const code = normalizeErrorMessage(candidate.code);
  const message = normalizeErrorMessage(candidate.message);
  const details = normalizeErrorMessage(candidate.details);
  const hint = normalizeErrorMessage(candidate.hint);
  const table = tableName.toLowerCase();

  if (code === "pgrst205" || code === "42p01") {
    return true;
  }

  return (
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    details.includes("does not exist") ||
    hint.includes(table) ||
    message.includes(table) ||
    details.includes(table)
  );
}

function markOptionalTableUnavailable(tableName: string, error: unknown) {
  if (!isMissingTableError(error, tableName)) {
    return false;
  }

  if (!unavailableOptionalTables.has(tableName)) {
    unavailableOptionalTables.add(tableName);
    const candidate = (error ?? {}) as SupabaseErrorLike;
    addMonitoringBreadcrumb({
      category: "student-engagement",
      message: `Optional Supabase table unavailable: ${tableName}`,
      data: {
        tableName,
        code: candidate.code ?? null,
        message: candidate.message ?? null,
      },
    });
  }

  return true;
}

async function queryOptionalRows(
  tableName: string,
  query: () => PromiseLike<{ data: UnknownRow[] | null; error: SupabaseErrorLike | null }>
) {
  if (!hasSupabaseConfig || unavailableOptionalTables.has(tableName)) {
    return [];
  }

  const { data, error } = await query();
  if (error) {
    if (markOptionalTableUnavailable(tableName, error)) {
      return [];
    }
    throw error;
  }

  return (data ?? []) as UnknownRow[];
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

function normalizeAnnouncement(row: UnknownRow): SessionAnnouncementRecord | null {
  const id = readString(row, "id");
  const sessionId = readString(row, "session_id", "sessionId");
  const body = sanitizeText(readString(row, "body"), { maxLength: 280 });
  const issuedAt = readString(row, "issued_at", "issuedAt");
  if (!id || !sessionId || !body || !issuedAt) {
    return null;
  }

  return {
    id,
    sessionId,
    title: sanitizeText(readString(row, "title"), { maxLength: 80 }) || undefined,
    body,
    type: readString(row, "type") === "voice" ? "voice" : "text",
    audioUrl: readString(row, "audio_url", "audioUrl") ?? undefined,
    issuedAt,
  };
}

function normalizeReaction(row: UnknownRow): StudentReactionRecord | null {
  const id = readString(row, "id");
  const sessionId = readString(row, "session_id", "sessionId");
  const anonymousId = readString(row, "anonymous_id", "anonymousId");
  const emoji = readString(row, "emoji");
  const createdAt = readString(row, "created_at", "createdAt");
  if (!id || !sessionId || !anonymousId || !emoji || !createdAt) {
    return null;
  }

  if (!["thumbs_up", "lightbulb", "question", "clap"].includes(emoji)) {
    return null;
  }

  return {
    id,
    sessionId,
    anonymousId,
    emoji: emoji as StudentReactionRecord["emoji"],
    createdAt,
  };
}

export async function listSessionAnnouncements(
  sessionId: string,
  limit = 12
): Promise<SessionAnnouncementRecord[]> {
  const rows = await queryOptionalRows(announcementsTable, () =>
    supabase
      .from(announcementsTable)
      .select("*")
      .eq("session_id", sessionId)
      .order("issued_at", { ascending: false })
      .limit(limit)
  );

  return rows
    .map((row) => normalizeAnnouncement(row))
    .filter((row): row is SessionAnnouncementRecord => Boolean(row));
}

export async function createSessionAnnouncement(args: {
  sessionId: string;
  title?: string;
  body: string;
  type?: "text" | "voice";
  audioUrl?: string;
}) {
  if (!hasSupabaseConfig) {
    throw new Error("Supabase is required to send announcements.");
  }

  if (unavailableOptionalTables.has(announcementsTable)) {
    throw new Error("Announcements are not configured in this project.");
  }

  const announcement = {
    id: `announcement_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    session_id: args.sessionId,
    title: sanitizeText(args.title, { maxLength: 80 }) || null,
    body: sanitizeText(args.body, { maxLength: 280 }),
    type: args.type ?? "text",
    audio_url: sanitizeText(args.audioUrl, { maxLength: 500 }) || null,
    issued_at: new Date().toISOString(),
  };

  if (!announcement.body) {
    throw new Error("Announcement text cannot be empty.");
  }

  const { error } = await supabase.from(announcementsTable).insert(announcement);
  if (error) {
    if (markOptionalTableUnavailable(announcementsTable, error)) {
      throw new Error("Announcements are not configured in this project.");
    }
    throw error;
  }

  return normalizeAnnouncement(announcement);
}

export async function listRecentReactions(
  sessionId: string,
  limit = 32
): Promise<StudentReactionRecord[]> {
  const rows = await queryOptionalRows(reactionsTable, () =>
    supabase
      .from(reactionsTable)
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );

  return rows
    .map((row) => normalizeReaction(row))
    .filter((row): row is StudentReactionRecord => Boolean(row));
}

export async function fetchSessionEngagement(
  sessionId: string,
  participantCount = 0
): Promise<SessionEngagementSnapshot> {
  if (!hasSupabaseConfig) {
    return {
      activeCount: 0,
      disconnectedCount: 0,
      engagementScore: 0,
      averageScreenSeconds: 0,
      signalMix: { gotIt: 0, sortOf: 0, lost: 0, silent: 0 },
      leaderboard: [],
    };
  }

  const since = new Date(Date.now() - 2 * 60_000).toISOString();

  const [
    heartbeatRows,
    reactionRows,
    pollResponseRows,
    questionRows,
    participantRows,
  ] = await Promise.all([
    queryOptionalRows(heartbeatsTable, () =>
      supabase
        .from(heartbeatsTable)
        .select("*")
        .eq("session_id", sessionId)
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(400)
    ),
    queryOptionalRows(reactionsTable, () =>
      supabase
        .from(reactionsTable)
        .select("anonymous_id")
        .eq("session_id", sessionId)
        .gte("created_at", since)
        .limit(400)
    ),
    queryOptionalRows(pollResponsesTable, () =>
      supabase
        .from(pollResponsesTable)
        .select("anonymous_id")
        .eq("session_id", sessionId)
        .gte("submitted_at", since)
        .limit(400)
    ),
    queryOptionalRows(questionsTable, () =>
      supabase
        .from(questionsTable)
        .select("anonymous_id")
        .eq("session_id", sessionId)
        .gte("timestamp", since)
        .limit(400)
    ),
    queryOptionalRows(participantsTable, () =>
      supabase
        .from(participantsTable)
        .select("anonymous_id")
        .eq("session_id", sessionId)
        .limit(400)
    ),
  ]);

  const knownParticipants = new Set(
    participantRows
      .map((row) => readString(row, "anonymous_id"))
      .filter((value): value is string => Boolean(value))
  );
  const totalParticipants = Math.max(participantCount, knownParticipants.size);

  const latestHeartbeatByStudent = new Map<string, UnknownRow>();
  const scoreByStudent = new Map<string, EngagementLeaderboardEntry>();
  let totalScreenTimeMs = 0;
  let heartbeatCount = 0;
  let gotIt = 0;
  let sortOf = 0;
  let lost = 0;

  const ensureEntry = (anonymousId: string) => {
    const existing = scoreByStudent.get(anonymousId);
    if (existing) {
      return existing;
    }

    const nextEntry: EngagementLeaderboardEntry = {
      anonymousId,
      score: 0,
      questions: 0,
      pollResponses: 0,
      reactions: 0,
      heartbeats: 0,
    };
    scoreByStudent.set(anonymousId, nextEntry);
    return nextEntry;
  };

  heartbeatRows.forEach((row) => {
    const anonymousId = readString(row, "anonymous_id");
    if (!anonymousId) {
      return;
    }

    if (!latestHeartbeatByStudent.has(anonymousId)) {
      latestHeartbeatByStudent.set(anonymousId, row);
    }

    const entry = ensureEntry(anonymousId);
    entry.heartbeats += 1;
    entry.score += 1;

    const screenTimeMs = readNumber(row, "screen_time_ms") ?? 0;
    totalScreenTimeMs += screenTimeMs;
    heartbeatCount += 1;
  });

  latestHeartbeatByStudent.forEach((row, anonymousId) => {
    const signalState = readString(row, "signal_state");
    if (signalState === "got_it") {
      gotIt += 1;
    } else if (signalState === "sort_of") {
      sortOf += 1;
    } else if (signalState === "lost") {
      lost += 1;
    }

    if (!scoreByStudent.has(anonymousId)) {
      ensureEntry(anonymousId);
    }
  });

  reactionRows.forEach((row) => {
    const anonymousId = readString(row, "anonymous_id");
    if (!anonymousId) {
      return;
    }

    const entry = ensureEntry(anonymousId);
    entry.reactions += 1;
    entry.score += 1;
  });

  pollResponseRows.forEach((row) => {
    const anonymousId = readString(row, "anonymous_id");
    if (!anonymousId) {
      return;
    }

    const entry = ensureEntry(anonymousId);
    entry.pollResponses += 1;
    entry.score += 2;
  });

  questionRows.forEach((row) => {
    const anonymousId = readString(row, "anonymous_id");
    if (!anonymousId) {
      return;
    }

    const entry = ensureEntry(anonymousId);
    entry.questions += 1;
    entry.score += 3;
  });

  const activeCount = latestHeartbeatByStudent.size;
  const disconnectedCount = Math.max(totalParticipants - activeCount, 0);
  const averageScreenSeconds =
    heartbeatCount === 0 ? 0 : Math.round(totalScreenTimeMs / heartbeatCount / 100) / 10;
  const activeRate = totalParticipants === 0 ? 0 : (activeCount / totalParticipants) * 100;
  const screenScore = Math.min(averageScreenSeconds / 30, 1) * 100;
  const engagementScore = Math.round(activeRate * 0.7 + screenScore * 0.3);

  return {
    activeCount,
    disconnectedCount,
    engagementScore,
    averageScreenSeconds,
    signalMix: {
      gotIt,
      sortOf,
      lost,
      silent: Math.max(totalParticipants - gotIt - sortOf - lost, 0),
    },
    leaderboard: [...scoreByStudent.values()]
      .sort((left, right) => right.score - left.score || left.anonymousId.localeCompare(right.anonymousId))
      .slice(0, 5),
  };
}

export function subscribeToAnnouncements(
  sessionId: string,
  callbacks: AnnouncementSubscriptionCallbacks
) {
  if (!hasSupabaseConfig || unavailableOptionalTables.has(announcementsTable)) {
    callbacks.onStatusChange?.("disabled");
    return () => undefined;
  }

  const channel = supabase.channel(`session-announcements:${sessionId}`);
  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: announcementsTable,
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      callbacks.onAnnouncementEvent?.();
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

export function subscribeToEngagement(
  sessionId: string,
  callbacks: EngagementSubscriptionCallbacks
) {
  const watchReactions = !unavailableOptionalTables.has(reactionsTable);
  const watchHeartbeats = !unavailableOptionalTables.has(heartbeatsTable);

  if (!hasSupabaseConfig || (!watchReactions && !watchHeartbeats)) {
    callbacks.onStatusChange?.("disabled");
    return () => undefined;
  }

  const channel = supabase.channel(`session-engagement:${sessionId}`);
  if (watchReactions) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: reactionsTable,
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        callbacks.onReactionEvent?.();
      }
    );
  }

  if (watchHeartbeats) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: heartbeatsTable,
        filter: `session_id=eq.${sessionId}`,
      },
      () => {
        callbacks.onHeartbeatEvent?.();
      }
    );
  }

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
