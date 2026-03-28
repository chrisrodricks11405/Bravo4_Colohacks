import { getDatabase } from "../db";
import { addMonitoringBreadcrumb, captureMonitoringException } from "../lib/monitoring";
import {
  sanitizeAnonymousId,
  sanitizeClusterSummary,
  sanitizeClusterTitle,
  sanitizeRepresentativeQuestion,
  sanitizeStudentQuestionText,
  sanitizeTeacherNote,
  sanitizeText,
} from "../lib/sanitization";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { queueSyncJob } from "./syncJobs";
import type {
  AnonymousQuestionPayload,
  ClusterStatus,
  ConfusionTrendPoint,
  InterventionActionPayload,
  InterventionType,
  LessonMarker,
  LessonMarkerType,
  MisconceptionClusterSummary,
  PulseAggregateSnapshot,
  PulseSignalEvent,
  PulseValue,
  ReasonChip,
  SessionMeta,
  SyncJobType,
} from "../types";

type UnknownRow = Record<string, unknown>;

type PulseCacheRow = {
  session_id: string;
  timestamp: string;
  got_it_count: number;
  sort_of_count: number;
  lost_count: number;
  total_active: number;
  disconnected_count: number;
  confusion_index: number;
};

type LocalPulseEventRow = {
  id: string;
  session_id: string;
  anonymous_id: string;
  pulse: string;
  timestamp: string;
  source: string;
  synced: number;
  synced_at: string | null;
};

type LessonMarkerRow = {
  id: string;
  session_id: string;
  type: string;
  label: string | null;
  timestamp: string;
  synced?: number;
  synced_at?: string | null;
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
  synced?: number;
  synced_at?: string | null;
};

type ClusterRow = {
  id: string;
  session_id: string;
  title: string;
  summary: string;
  affected_count: number;
  representative_question: string;
  reason_chip: string;
  lesson_marker_id: string | null;
  translation: string | null;
  status: string;
  suggested_interventions: string | null;
  created_at: string;
  updated_at: string;
};

type QuestionRow = {
  id: string;
  session_id: string;
  anonymous_id: string;
  text: string;
  language: string | null;
  lesson_marker_id: string | null;
  timestamp: string;
  synced?: number;
  synced_at?: string | null;
};

type ParticipantRoster = {
  totalJoined: number;
  activeCount: number;
  disconnectedCount: number;
  activeAnonymousIds: string[];
};

type InterventionMutationOptions = {
  attemptRemoteSync?: boolean;
  queueOnFailure?: boolean;
  syncJobType?: SyncJobType;
};

type LessonMarkerMutationOptions = {
  attemptRemoteSync?: boolean;
  queueOnFailure?: boolean;
};

export type LiveSessionChannelStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR"
  | "disabled";

export interface LiveSessionSnapshot {
  pulse: PulseAggregateSnapshot | null;
  clusters: MisconceptionClusterSummary[];
  participantRoster: ParticipantRoster;
}

interface LiveSessionSubscriptionCallbacks {
  onPulseEvent?: () => void;
  onParticipantEvent?: () => void;
  onQuestionEvent?: () => void;
  onClusterEvent?: () => void;
  onInterventionEvent?: () => void;
  onStatusChange?: (status: LiveSessionChannelStatus) => void;
  onError?: (message: string) => void;
}

const participantsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_PARTICIPANTS_TABLE ?? "session_participants";
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
const lessonMarkersTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_LESSON_MARKERS_TABLE ??
  "session_lesson_markers";
const questionClusteringFunction =
  process.env.EXPO_PUBLIC_SUPABASE_QUESTION_CLUSTER_FUNCTION ??
  "question-clustering";

const INSERT_PULSE_CACHE_SQL = `
  INSERT INTO local_pulse_cache (
    session_id,
    timestamp,
    got_it_count,
    sort_of_count,
    lost_count,
    total_active,
    disconnected_count,
    confusion_index
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`;

const UPSERT_LOCAL_PULSE_EVENT_SQL = `
  INSERT INTO local_pulse_events (
    id,
    session_id,
    anonymous_id,
    pulse,
    timestamp,
    source,
    synced,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    anonymous_id = excluded.anonymous_id,
    pulse = excluded.pulse,
    timestamp = excluded.timestamp,
    source = excluded.source,
    synced = excluded.synced,
    synced_at = excluded.synced_at;
`;

const UPSERT_LESSON_MARKER_SQL = `
  INSERT INTO lesson_markers (
    id,
    session_id,
    type,
    label,
    timestamp,
    synced,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    type = excluded.type,
    label = excluded.label,
    timestamp = excluded.timestamp,
    synced = excluded.synced,
    synced_at = excluded.synced_at;
`;

const UPSERT_INTERVENTION_SQL = `
  INSERT INTO intervention_history (
    id,
    session_id,
    type,
    cluster_id,
    lesson_marker_id,
    timestamp,
    confusion_before,
    confusion_after,
    recovery_score,
    recovery_window_seconds,
    duration_seconds,
    notes,
    synced,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    type = excluded.type,
    cluster_id = excluded.cluster_id,
    lesson_marker_id = excluded.lesson_marker_id,
    timestamp = excluded.timestamp,
    confusion_before = excluded.confusion_before,
    confusion_after = excluded.confusion_after,
    recovery_score = excluded.recovery_score,
    recovery_window_seconds = excluded.recovery_window_seconds,
    duration_seconds = excluded.duration_seconds,
    notes = excluded.notes,
    synced = excluded.synced,
    synced_at = excluded.synced_at;
`;

const UPSERT_CLUSTER_SQL = `
  INSERT INTO cluster_cache (
    id,
    session_id,
    title,
    summary,
    affected_count,
    representative_question,
    reason_chip,
    lesson_marker_id,
    translation,
    status,
    suggested_interventions,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    summary = excluded.summary,
    affected_count = excluded.affected_count,
    representative_question = excluded.representative_question,
    reason_chip = excluded.reason_chip,
    lesson_marker_id = excluded.lesson_marker_id,
    translation = excluded.translation,
    status = excluded.status,
    suggested_interventions = excluded.suggested_interventions,
    updated_at = excluded.updated_at;
`;

const UPSERT_QUESTION_SQL = `
  INSERT INTO question_cache (
    id,
    session_id,
    anonymous_id,
    text,
    language,
    lesson_marker_id,
    timestamp,
    synced,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    anonymous_id = excluded.anonymous_id,
    text = excluded.text,
    language = excluded.language,
    lesson_marker_id = excluded.lesson_marker_id,
    timestamp = excluded.timestamp,
    synced = excluded.synced,
    synced_at = excluded.synced_at;
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

function readBoolean(row: UnknownRow, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value > 0;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "online", "active", "connected"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "offline", "inactive", "disconnected"].includes(normalized)) {
        return false;
      }
    }
  }

  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function generateId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function toIsoString(value?: string | null) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parseJsonArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizePulseValue(value: string | null): PulseValue | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");

  if (["got_it", "gotit", "understood", "clear"].includes(normalized)) {
    return "got_it";
  }

  if (["sort_of", "sortof", "partial", "unsure"].includes(normalized)) {
    return "sort_of";
  }

  if (["lost", "confused", "need_help"].includes(normalized)) {
    return "lost";
  }

  return null;
}

function normalizeLessonMarkerType(value: string | null): LessonMarkerType {
  switch (value) {
    case "new_concept":
    case "example":
    case "practice":
    case "review":
    case "question_time":
    case "custom":
      return value;
    default:
      return "custom";
  }
}

function normalizeInterventionType(value: string | null): InterventionType {
  switch (value) {
    case "reteach":
    case "example":
    case "poll":
    case "language_switch":
    case "pause":
    case "analogy":
    case "bilingual_explanation":
    case "board_script":
    case "other":
      return value;
    default:
      return "other";
  }
}

function normalizeClusterStatus(value: string | null): ClusterStatus {
  switch (value) {
    case "active":
    case "acknowledged":
    case "resolved":
    case "dismissed":
      return value;
    default:
      return "active";
  }
}

function normalizeReasonChip(value: string | null): ReasonChip {
  switch (value) {
    case "step_unclear":
    case "language_friction":
    case "missing_prerequisite":
    case "too_fast":
    case "notation_confusion":
    case "example_needed":
    case "other":
      return value;
    default:
      return "other";
  }
}

const QUESTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "but",
  "by",
  "can",
  "do",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "so",
  "the",
  "this",
  "to",
  "we",
  "what",
  "when",
  "where",
  "why",
  "with",
  "you",
  "your",
  "please",
  "question",
  "doubt",
  "again",
  "explain",
  "understand",
  "understanding",
]);

function tokenizeQuestion(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 3 &&
        !QUESTION_STOP_WORDS.has(token) &&
        !/^\d+$/.test(token)
    );
}

function getKeywordAnchors(text: string, limit = 4) {
  const counts = new Map<string, number>();

  tokenizeQuestion(text).forEach((token) => {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function jaccardOverlap(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;

  left.forEach((token) => {
    if (right.has(token)) {
      intersection += 1;
    }
  });

  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function mergeKeywordAnchors(
  existingAnchors: string[],
  nextAnchors: string[],
  limit = 6
) {
  return [...new Set([...existingAnchors, ...nextAnchors])].slice(0, limit);
}

function inferReasonChip(
  question: AnonymousQuestionPayload,
  sessionLanguage?: string
): ReasonChip {
  const normalizedText = question.text.toLowerCase();
  const normalizedQuestionLanguage = question.language?.trim().toLowerCase();
  const normalizedSessionLanguage = sessionLanguage?.trim().toLowerCase();

  if (
    normalizedQuestionLanguage &&
    normalizedSessionLanguage &&
    normalizedQuestionLanguage !== normalizedSessionLanguage
  ) {
    return "language_friction";
  }

  if (
    /translate|meaning|wording|language|english|hindi|tamil|telugu|marathi|bengali|urdu/i.test(
      normalizedText
    )
  ) {
    return "language_friction";
  }

  if (/step|which comes|after that|before that|how do we start|next step/i.test(normalizedText)) {
    return "step_unclear";
  }

  if (/fast|again|repeat|slow|quickly|too quick|too fast/i.test(normalizedText)) {
    return "too_fast";
  }

  if (/sign|symbol|notation|bracket|minus|plus|arrow|formula/i.test(normalizedText)) {
    return "notation_confusion";
  }

  if (/basic|prerequisite|already know|remember|before this|foundation/i.test(normalizedText)) {
    return "missing_prerequisite";
  }

  if (/example|another one|one more|sample|solve one/i.test(normalizedText)) {
    return "example_needed";
  }

  return "other";
}

function buildClusterId(
  sessionId: string,
  reasonChip: ReasonChip,
  lessonMarkerId: string | undefined,
  keywordAnchors: string[]
) {
  const markerPart = lessonMarkerId ? slugify(lessonMarkerId) : "no_marker";
  const anchorPart = keywordAnchors.length > 0 ? keywordAnchors.join("_") : "general";
  return slugify(`cluster_${sessionId}_${reasonChip}_${markerPart}_${anchorPart}`);
}

function resolveQuestionLessonMarker(
  question: AnonymousQuestionPayload,
  lessonMarkers: LessonMarker[]
) {
  if (question.lessonMarkerId) {
    return question.lessonMarkerId;
  }

  const questionTimestamp = new Date(question.timestamp).getTime();
  if (!Number.isFinite(questionTimestamp)) {
    return undefined;
  }

  const marker = [...lessonMarkers]
    .reverse()
    .find((candidate) => new Date(candidate.timestamp).getTime() <= questionTimestamp);

  return marker?.id;
}

function getReasonSummary(reasonChip: ReasonChip) {
  switch (reasonChip) {
    case "step_unclear":
      return "students are unsure about the sequence of steps";
    case "language_friction":
      return "wording or language choice is blocking comprehension";
    case "missing_prerequisite":
      return "a prerequisite idea may need a quick reset";
    case "too_fast":
      return "the pace may be moving faster than the room can track";
    case "notation_confusion":
      return "notation or symbols are being interpreted inconsistently";
    case "example_needed":
      return "students want one more worked example";
    default:
      return "several students are circling the same sticking point";
  }
}

function buildClusterTitle(reasonChip: ReasonChip, keywordAnchors: string[]) {
  const topicHandle = keywordAnchors.slice(0, 2).join(" ");

  switch (reasonChip) {
    case "step_unclear":
      return topicHandle
        ? `Steps unclear around ${topicHandle}`
        : "Steps unclear";
    case "language_friction":
      return topicHandle
        ? `Language friction on ${topicHandle}`
        : "Language friction";
    case "missing_prerequisite":
      return topicHandle
        ? `Prerequisite gap near ${topicHandle}`
        : "Missing prerequisite";
    case "too_fast":
      return topicHandle ? `Pace feels fast in ${topicHandle}` : "Pace feels fast";
    case "notation_confusion":
      return topicHandle
        ? `Notation confusion in ${topicHandle}`
        : "Notation confusion";
    case "example_needed":
      return topicHandle
        ? `More examples needed for ${topicHandle}`
        : "More examples needed";
    default:
      return topicHandle ? `Questions about ${topicHandle}` : "Recurring question cluster";
  }
}

function buildSuggestedInterventions(
  reasonChip: ReasonChip,
  session?: SessionMeta | null
) {
  const languageHint = session?.language ? `Rephrase once in ${session.language}` : "Rephrase once";

  switch (reasonChip) {
    case "step_unclear":
      return [
        "Work one example line by line",
        "Pause after each step and ask what changes next",
        "Run a two-option confidence poll",
      ];
    case "language_friction":
      return [
        languageHint,
        "Swap technical wording for a simpler phrase",
        "Check understanding with one student paraphrase",
      ];
    case "missing_prerequisite":
      return [
        "Revisit the prerequisite for 60 seconds",
        "Connect the new step to yesterday's idea",
        "Ask one recall question before moving on",
      ];
    case "too_fast":
      return [
        "Slow the pace and recap the last transition",
        "Repeat the key step with a fresh example",
        "Give students ten silent seconds to reset",
      ];
    case "notation_confusion":
      return [
        "Rewrite the notation larger on the board",
        "Contrast the correct and incorrect symbol usage",
        "Ask students what each symbol means",
      ];
    case "example_needed":
      return [
        "Solve one more example from scratch",
        "Ask students to predict the next move",
        "Use a quick poll before independent practice",
      ];
    default:
      return [
        "Open the cluster detail and inspect the representative question",
        "Acknowledge the cluster so the room knows you saw it",
        "Generate a quick poll if confusion keeps climbing",
      ];
  }
}

function buildClusterSummary(
  reasonChip: ReasonChip,
  keywordAnchors: string[],
  affectedCount: number
) {
  const topicHandle = keywordAnchors.slice(0, 3).join(", ");
  const countLabel = affectedCount === 1 ? "1 student" : `${affectedCount} students`;

  if (!topicHandle) {
    return `${countLabel} are surfacing the same concern; ${getReasonSummary(reasonChip)}.`;
  }

  return `${countLabel} are asking about ${topicHandle}; ${getReasonSummary(reasonChip)}.`;
}

function pickRepresentativeQuestion(questions: AnonymousQuestionPayload[]) {
  return [...questions]
    .sort((left, right) => {
      const timeDelta =
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();

      if (timeDelta !== 0) {
        return timeDelta;
      }

      return right.text.length - left.text.length;
    })[0]?.text;
}

function normalizePulseCacheRow(row: PulseCacheRow): PulseAggregateSnapshot {
  return {
    sessionId: row.session_id,
    timestamp: row.timestamp,
    gotItCount: row.got_it_count,
    sortOfCount: row.sort_of_count,
    lostCount: row.lost_count,
    totalActive: row.total_active,
    disconnectedCount: row.disconnected_count,
    confusionIndex: row.confusion_index,
  };
}

function normalizeLessonMarkerRow(row: LessonMarkerRow): LessonMarker {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: normalizeLessonMarkerType(row.type),
    label: sanitizeText(row.label, { maxLength: 80 }) || undefined,
    timestamp: row.timestamp,
  };
}

function normalizeInterventionRow(row: InterventionRow): InterventionActionPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: normalizeInterventionType(row.type),
    clusterId: row.cluster_id ?? undefined,
    lessonMarkerId: row.lesson_marker_id ?? undefined,
    timestamp: row.timestamp,
    confusionBefore: row.confusion_before,
    confusionAfter: row.confusion_after ?? undefined,
    recoveryScore: row.recovery_score ?? undefined,
    recoveryWindowSeconds: row.recovery_window_seconds,
    durationSeconds: row.duration_seconds ?? undefined,
    notes: sanitizeTeacherNote(row.notes) || undefined,
  };
}

function normalizeClusterRow(row: ClusterRow): MisconceptionClusterSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: sanitizeClusterTitle(row.title),
    summary: sanitizeClusterSummary(row.summary),
    affectedCount: row.affected_count,
    representativeQuestion: sanitizeRepresentativeQuestion(row.representative_question),
    reasonChip: row.reason_chip as MisconceptionClusterSummary["reasonChip"],
    lessonMarkerId: row.lesson_marker_id ?? undefined,
    translation: sanitizeText(row.translation, {
      allowMultiline: true,
      maxLength: 240,
    }) || undefined,
    status: normalizeClusterStatus(row.status),
    suggestedInterventions: parseJsonArray(row.suggested_interventions).map((value) =>
      sanitizeText(value, { maxLength: 120 })
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeQuestionRow(row: QuestionRow): AnonymousQuestionPayload {
  return {
    id: row.id,
    sessionId: row.session_id,
    anonymousId: sanitizeAnonymousId(row.anonymous_id),
    text: sanitizeStudentQuestionText(row.text),
    language: sanitizeText(row.language, { maxLength: 24 }) || undefined,
    lessonMarkerId: row.lesson_marker_id ?? undefined,
    timestamp: row.timestamp,
  };
}

function normalizeRemoteCluster(row: UnknownRow): MisconceptionClusterSummary | null {
  const id = readString(row, "id");
  const sessionId = readString(row, "session_id", "sessionId");
  const title = readString(row, "title");
  const summary = readString(row, "summary");
  const representativeQuestion = readString(
    row,
    "representative_question",
    "representativeQuestion"
  );
  const createdAt = readString(row, "created_at", "createdAt");
  const updatedAt = readString(row, "updated_at", "updatedAt");

  if (
    !id ||
    !sessionId ||
    !title ||
    !summary ||
    !representativeQuestion ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const suggestions = row.suggested_interventions;
  const keywordAnchorsValue = row.keyword_anchors;
  const keywordAnchors =
    Array.isArray(keywordAnchorsValue)
      ? keywordAnchorsValue.filter((entry): entry is string => typeof entry === "string")
      : parseJsonArray(typeof keywordAnchorsValue === "string" ? keywordAnchorsValue : null);

  return {
    id,
    sessionId,
    title: sanitizeClusterTitle(title),
    summary: sanitizeClusterSummary(summary),
    affectedCount: readNumber(row, "affected_count", "affectedCount") ?? 0,
    representativeQuestion: sanitizeRepresentativeQuestion(representativeQuestion),
    reasonChip:
      (readString(row, "reason_chip", "reasonChip") as MisconceptionClusterSummary["reasonChip"]) ??
      "other",
    lessonMarkerId:
      readString(row, "lesson_marker_id", "lessonMarkerId") ?? undefined,
    translation:
      sanitizeText(readString(row, "translation"), {
        allowMultiline: true,
        maxLength: 240,
      }) || undefined,
    keywordAnchors: keywordAnchors.length > 0 ? keywordAnchors : undefined,
    latestQuestionAt:
      readString(row, "latest_question_at", "latestQuestionAt") ?? undefined,
    source:
      readString(row, "source") === "ai" || readString(row, "source") === "fallback"
        ? (readString(row, "source") as MisconceptionClusterSummary["source"])
        : undefined,
    status: normalizeClusterStatus(readString(row, "status")),
    suggestedInterventions:
      Array.isArray(suggestions)
        ? suggestions
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => sanitizeText(entry, { maxLength: 120 }))
        : parseJsonArray(typeof suggestions === "string" ? suggestions : null).map((entry) =>
            sanitizeText(entry, { maxLength: 120 })
          ),
    createdAt,
    updatedAt,
  };
}

function normalizeRemoteQuestion(row: UnknownRow): AnonymousQuestionPayload | null {
  const id = readString(row, "id");
  const sessionId = readString(row, "session_id", "sessionId");
  const anonymousId = readString(row, "anonymous_id", "anonymousId", "student_id", "studentId");
  const text = readString(row, "text", "question", "question_text", "body");
  const timestamp = readString(row, "timestamp", "created_at", "createdAt", "updated_at", "updatedAt");

  if (!id || !sessionId || !anonymousId || !text || !timestamp) {
    return null;
  }

  return {
    id,
    sessionId,
    anonymousId: sanitizeAnonymousId(anonymousId),
    text: sanitizeStudentQuestionText(text),
    language: sanitizeText(readString(row, "language"), { maxLength: 24 }) || undefined,
    lessonMarkerId:
      readString(row, "lesson_marker_id", "lessonMarkerId") ?? undefined,
    timestamp: toIsoString(timestamp),
  };
}

function normalizeRemoteIntervention(row: UnknownRow): InterventionActionPayload | null {
  const id = readString(row, "id");
  const sessionId = readString(row, "session_id", "sessionId");
  const timestamp = readString(row, "timestamp", "created_at", "createdAt");
  const confusionBefore = readNumber(row, "confusion_before", "confusionBefore");

  if (!id || !sessionId || !timestamp || confusionBefore == null) {
    return null;
  }

  return {
    id,
    sessionId,
    type: normalizeInterventionType(readString(row, "type")),
    clusterId: readString(row, "cluster_id", "clusterId") ?? undefined,
    lessonMarkerId:
      readString(row, "lesson_marker_id", "lessonMarkerId") ?? undefined,
    timestamp: toIsoString(timestamp),
    confusionBefore,
    confusionAfter:
      readNumber(row, "confusion_after", "confusionAfter") ?? undefined,
    recoveryScore:
      readNumber(row, "recovery_score", "recoveryScore") ?? undefined,
    recoveryWindowSeconds:
      readNumber(
        row,
        "recovery_window_seconds",
        "recoveryWindowSeconds"
      ) ?? 60,
    durationSeconds:
      readNumber(row, "duration_seconds", "durationSeconds") ?? undefined,
    notes: sanitizeTeacherNote(readString(row, "notes")) || undefined,
  };
}

function normalizeRemotePulseEvent(row: UnknownRow): PulseSignalEvent | null {
  const sessionId = readString(row, "session_id", "sessionId");
  const anonymousId = readString(
    row,
    "anonymous_id",
    "anonymousId",
    "participant_id",
    "participantId",
    "student_id",
    "studentId"
  );
  const pulse = normalizePulseValue(
    readString(row, "pulse", "value", "pulse_value", "pulseValue", "status")
  );
  const timestamp = readString(row, "timestamp", "created_at", "createdAt", "updated_at", "updatedAt");

  if (!sessionId || !anonymousId || !pulse || !timestamp) {
    return null;
  }

  return {
    sessionId,
    anonymousId,
    pulse,
    timestamp: toIsoString(timestamp),
  };
}

function normalizeRemoteAggregateSnapshot(
  row: UnknownRow,
  sampledAt: string,
  participantRoster: ParticipantRoster
): PulseAggregateSnapshot | null {
  const sessionId = readString(row, "session_id", "sessionId");
  const gotItCount = readNumber(row, "got_it_count", "gotItCount");
  const sortOfCount = readNumber(row, "sort_of_count", "sortOfCount");
  const lostCount = readNumber(row, "lost_count", "lostCount");

  if (
    !sessionId ||
    gotItCount == null ||
    sortOfCount == null ||
    lostCount == null
  ) {
    return null;
  }

  const totalActiveFromRow = readNumber(row, "total_active", "totalActive");
  const totalActive =
    participantRoster.activeCount > 0
      ? Math.max(participantRoster.activeCount, gotItCount + sortOfCount + lostCount)
      : Math.max(totalActiveFromRow ?? 0, gotItCount + sortOfCount + lostCount);
  const disconnectedCount =
    participantRoster.disconnectedCount > 0
      ? participantRoster.disconnectedCount
      : readNumber(row, "disconnected_count", "disconnectedCount") ?? 0;

  const snapshot: PulseAggregateSnapshot = {
    sessionId,
    timestamp: sampledAt,
    gotItCount,
    sortOfCount,
    lostCount,
    totalActive,
    disconnectedCount,
    confusionIndex:
      readNumber(row, "confusion_index", "confusionIndex") ??
      computeConfusionIndex({
        gotItCount,
        sortOfCount,
        lostCount,
        totalActive,
        disconnectedCount,
      }),
  };

  return snapshot;
}

function inferParticipantConnected(row: UnknownRow) {
  const directFlag = readBoolean(
    row,
    "is_connected",
    "isConnected",
    "connected",
    "online"
  );

  if (directFlag != null) {
    return directFlag;
  }

  const status = readString(row, "status", "connection_status", "presence_state", "state");
  if (status) {
    const normalized = status.trim().toLowerCase();
    if (["connected", "online", "active", "present", "joined", "live"].includes(normalized)) {
      return true;
    }

    if (["disconnected", "offline", "inactive", "left", "dropped"].includes(normalized)) {
      return false;
    }
  }

  const lastSeenAt = readString(row, "last_seen_at", "lastSeenAt", "updated_at", "updatedAt");
  if (lastSeenAt) {
    const ageMs = Date.now() - new Date(lastSeenAt).getTime();
    if (Number.isFinite(ageMs)) {
      return ageMs <= 45_000;
    }
  }

  return true;
}

function normalizeParticipantRoster(rows: UnknownRow[]): ParticipantRoster {
  const participants = new Map<string, boolean>();

  rows.forEach((row, index) => {
    const participantId =
      readString(
        row,
        "anonymous_id",
        "anonymousId",
        "participant_id",
        "participantId",
        "student_id",
        "studentId",
        "id"
      ) ?? `participant_${index}`;

    participants.set(participantId, inferParticipantConnected(row));
  });

  const activeAnonymousIds = [...participants.entries()]
    .filter(([, isConnected]) => isConnected)
    .map(([participantId]) => participantId);

  const totalJoined = participants.size;
  const activeCount = activeAnonymousIds.length;

  return {
    totalJoined,
    activeCount,
    disconnectedCount: Math.max(totalJoined - activeCount, 0),
    activeAnonymousIds,
  };
}

export function computeConfusionIndex({
  gotItCount,
  sortOfCount,
  lostCount,
  totalActive,
  disconnectedCount,
}: Pick<
  PulseAggregateSnapshot,
  | "gotItCount"
  | "sortOfCount"
  | "lostCount"
  | "totalActive"
  | "disconnectedCount"
>) {
  const respondedCount = gotItCount + sortOfCount + lostCount;
  const silentCount = Math.max(totalActive - respondedCount, 0);
  const population = Math.max(totalActive + disconnectedCount, 1);
  const weightedScore =
    sortOfCount * 0.45 +
    lostCount * 1 +
    disconnectedCount * 0.65 +
    silentCount * 0.2;

  return Math.round(clamp((weightedScore / population) * 100, 0, 100) * 10) / 10;
}

export function computeLostPercent(snapshot: Pick<PulseAggregateSnapshot, "lostCount" | "totalActive">) {
  if (snapshot.totalActive <= 0) {
    return 0;
  }

  return Math.round((snapshot.lostCount / snapshot.totalActive) * 1000) / 10;
}

export function buildTrendPoint(
  snapshot: PulseAggregateSnapshot,
  interventionId?: string
): ConfusionTrendPoint {
  return {
    timestamp: snapshot.timestamp,
    confusionIndex: snapshot.confusionIndex,
    lostPercent: computeLostPercent(snapshot),
    hasInterventionMarker: Boolean(interventionId),
    interventionId,
  };
}

function normalizeLocalPulseEventRow(row: LocalPulseEventRow): PulseSignalEvent {
  return {
    sessionId: row.session_id,
    anonymousId: row.anonymous_id,
    pulse: normalizePulseValue(row.pulse) ?? "sort_of",
    timestamp: row.timestamp,
  };
}

async function persistPulseEvents(events: PulseSignalEvent[], synced = true) {
  if (events.length === 0) {
    return;
  }

  const db = await getDatabase();
  const syncedAt = synced ? new Date().toISOString() : null;

  for (const event of events) {
    await db.runAsync(
      UPSERT_LOCAL_PULSE_EVENT_SQL,
      `${event.sessionId}:${event.anonymousId}:${event.timestamp}`,
      event.sessionId,
      event.anonymousId,
      event.pulse,
      event.timestamp,
      "remote",
      synced ? 1 : 0,
      syncedAt
    );
  }
}

async function listLocalPulseEvents(
  sessionId: string,
  limit = 1_200
): Promise<PulseSignalEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LocalPulseEventRow>(
    `
      SELECT
        id,
        session_id,
        anonymous_id,
        pulse,
        timestamp,
        source,
        synced,
        synced_at
      FROM local_pulse_events
      WHERE session_id = ?
      ORDER BY datetime(timestamp) DESC
      LIMIT ?;
    `,
    sessionId,
    limit
  );

  return rows.map(normalizeLocalPulseEventRow);
}

async function deriveLocalSnapshotFromCache(args: {
  sessionId: string;
  session?: SessionMeta | null;
}): Promise<LiveSessionSnapshot> {
  const [events, cachedSnapshots, cachedClusters] = await Promise.all([
    listLocalPulseEvents(args.sessionId),
    listCachedPulseSnapshots(args.sessionId, 1),
    listCachedClusters(args.sessionId),
  ]);

  const latestSnapshot = cachedSnapshots[cachedSnapshots.length - 1] ?? null;

  if (events.length === 0) {
    const participantTotal =
      (latestSnapshot?.totalActive ?? 0) + (latestSnapshot?.disconnectedCount ?? 0);

    return {
      pulse: latestSnapshot,
      clusters: cachedClusters,
      participantRoster: {
        totalJoined: Math.max(
          args.session?.participantCount ?? 0,
          participantTotal,
          latestSnapshot?.totalActive ?? 0
        ),
        activeCount: latestSnapshot?.totalActive ?? 0,
        disconnectedCount: latestSnapshot?.disconnectedCount ?? 0,
        activeAnonymousIds: [],
      },
    };
  }

  const latestPulseByStudent = new Map<string, PulseSignalEvent>();

  [...events]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .forEach((event) => {
      if (!latestPulseByStudent.has(event.anonymousId)) {
        latestPulseByStudent.set(event.anonymousId, event);
      }
    });

  let gotItCount = 0;
  let sortOfCount = 0;
  let lostCount = 0;

  latestPulseByStudent.forEach((event) => {
    if (event.pulse === "got_it") {
      gotItCount += 1;
      return;
    }

    if (event.pulse === "sort_of") {
      sortOfCount += 1;
      return;
    }

    lostCount += 1;
  });

  const activeCount = latestPulseByStudent.size;
  const inferredTotalJoined = Math.max(
    args.session?.participantCount ?? 0,
    latestSnapshot
      ? latestSnapshot.totalActive + latestSnapshot.disconnectedCount
      : 0,
    activeCount
  );
  const disconnectedCount = Math.max(inferredTotalJoined - activeCount, 0);
  const timestamp =
    [...latestPulseByStudent.values()]
      .map((event) => event.timestamp)
      .sort((left, right) => right.localeCompare(left))[0] ?? new Date().toISOString();

  return {
    pulse: {
      sessionId: args.sessionId,
      timestamp,
      gotItCount,
      sortOfCount,
      lostCount,
      totalActive: activeCount,
      disconnectedCount,
      confusionIndex: computeConfusionIndex({
        gotItCount,
        sortOfCount,
        lostCount,
        totalActive: activeCount,
        disconnectedCount,
      }),
    },
    clusters: cachedClusters,
    participantRoster: {
      totalJoined: inferredTotalJoined,
      activeCount,
      disconnectedCount,
      activeAnonymousIds: [...latestPulseByStudent.keys()],
    },
  };
}

function deriveLiveSnapshotFromEvents(
  sessionId: string,
  rows: UnknownRow[],
  sampledAt: string,
  participantRoster: ParticipantRoster
): PulseAggregateSnapshot | null {
  const aggregateRows = rows
    .map((row) => normalizeRemoteAggregateSnapshot(row, sampledAt, participantRoster))
    .filter((row): row is PulseAggregateSnapshot => Boolean(row))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  if (aggregateRows.length > 0) {
    return aggregateRows[0];
  }

  const activeIdFilter =
    participantRoster.activeAnonymousIds.length > 0
      ? new Set(participantRoster.activeAnonymousIds)
      : null;

  const latestPulseByStudent = new Map<string, PulseSignalEvent>();

  rows
    .map((row) => normalizeRemotePulseEvent(row))
    .filter((row): row is PulseSignalEvent => Boolean(row))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .forEach((event) => {
      if (event.sessionId !== sessionId) {
        return;
      }

      if (activeIdFilter && !activeIdFilter.has(event.anonymousId)) {
        return;
      }

      if (!latestPulseByStudent.has(event.anonymousId)) {
        latestPulseByStudent.set(event.anonymousId, event);
      }
    });

  if (latestPulseByStudent.size === 0 && participantRoster.totalJoined === 0) {
    return null;
  }

  let gotItCount = 0;
  let sortOfCount = 0;
  let lostCount = 0;

  for (const event of latestPulseByStudent.values()) {
    if (event.pulse === "got_it") {
      gotItCount += 1;
    } else if (event.pulse === "sort_of") {
      sortOfCount += 1;
    } else {
      lostCount += 1;
    }
  }

  const totalActive =
    participantRoster.activeCount > 0
      ? participantRoster.activeCount
      : gotItCount + sortOfCount + lostCount;

  return {
    sessionId,
    timestamp: sampledAt,
    gotItCount,
    sortOfCount,
    lostCount,
    totalActive,
    disconnectedCount: participantRoster.disconnectedCount,
    confusionIndex: computeConfusionIndex({
      gotItCount,
      sortOfCount,
      lostCount,
      totalActive,
      disconnectedCount: participantRoster.disconnectedCount,
    }),
  };
}

async function fetchParticipantRows(sessionId: string): Promise<UnknownRow[]> {
  const { data, error } = await supabase
    .from(participantsTable)
    .select("*")
    .eq("session_id", sessionId);

  if (error) {
    throw error;
  }

  return (data as UnknownRow[] | null) ?? [];
}

async function fetchPulseRows(sessionId: string, limit = 1_200): Promise<UnknownRow[]> {
  const { data, error } = await supabase
    .from(pulseEventsTable)
    .select("*")
    .eq("session_id", sessionId)
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data as UnknownRow[] | null) ?? [];
}

async function fetchRemoteClusters(sessionId: string): Promise<MisconceptionClusterSummary[]> {
  const { data, error } = await supabase
    .from(clustersTable)
    .select("*")
    .eq("session_id", sessionId)
    .limit(24);

  if (error) {
    throw error;
  }

  return ((data as UnknownRow[] | null) ?? [])
    .map((row) => normalizeRemoteCluster(row))
    .filter((row): row is MisconceptionClusterSummary => Boolean(row))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function fetchRemoteQuestions(sessionId: string): Promise<AnonymousQuestionPayload[]> {
  const { data, error } = await supabase
    .from(questionsTable)
    .select("*")
    .eq("session_id", sessionId)
    .order("timestamp", { ascending: false })
    .limit(120);

  if (error) {
    throw error;
  }

  return ((data as UnknownRow[] | null) ?? [])
    .map((row) => normalizeRemoteQuestion(row))
    .filter((row): row is AnonymousQuestionPayload => Boolean(row));
}

async function fetchRemoteInterventions(
  sessionId: string
): Promise<InterventionActionPayload[]> {
  const { data, error } = await supabase
    .from(interventionsTable)
    .select("*")
    .eq("session_id", sessionId)
    .order("timestamp", { ascending: true })
    .limit(120);

  if (error) {
    throw error;
  }

  return ((data as UnknownRow[] | null) ?? [])
    .map((row) => normalizeRemoteIntervention(row))
    .filter((row): row is InterventionActionPayload => Boolean(row));
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

async function enqueueSyncJob(
  type: SyncJobType,
  payload: InterventionActionPayload | AnonymousQuestionPayload | LessonMarker | { sessionId: string },
  errorMessage?: string
) {
  const sessionId =
    "sessionId" in payload && typeof payload.sessionId === "string"
      ? payload.sessionId
      : undefined;

  await queueSyncJob({
    type,
    payload,
    sessionId,
    jobKey:
      type === "pulse_batch" || type === "question_batch"
        ? `${type}:${sessionId ?? "unknown"}`
        : type === "lesson_marker" && "id" in payload
          ? `lesson_marker:${String(payload.id)}`
          : type === "intervention" && "id" in payload
            ? `intervention:${String(payload.id)}`
            : undefined,
    errorMessage,
    dedupe:
      type === "pulse_batch" || type === "question_batch"
        ? "ignore"
        : "replace",
  });
}

async function persistIntervention(
  intervention: InterventionActionPayload,
  synced = false
) {
  const db = await getDatabase();
  const syncedAt = synced ? new Date().toISOString() : null;

  await db.runAsync(
    UPSERT_INTERVENTION_SQL,
    intervention.id,
    intervention.sessionId,
    intervention.type,
    intervention.clusterId ?? null,
    intervention.lessonMarkerId ?? null,
    intervention.timestamp,
    intervention.confusionBefore,
    intervention.confusionAfter ?? null,
    intervention.recoveryScore ?? null,
    intervention.recoveryWindowSeconds,
    intervention.durationSeconds ?? null,
    intervention.notes ?? null,
    synced ? 1 : 0,
    syncedAt
  );
}

async function persistInterventions(
  interventions: InterventionActionPayload[],
  synced = true
) {
  for (const intervention of interventions) {
    await persistIntervention(intervention, synced);
  }
}

async function upsertRemoteIntervention(intervention: InterventionActionPayload) {
  const { error } = await supabase
    .from(interventionsTable)
    .upsert(interventionToRemoteRow(intervention), { onConflict: "id" });

  if (error) {
    throw error;
  }
}

async function saveIntervention(
  intervention: InterventionActionPayload,
  options: InterventionMutationOptions = {}
) {
  const {
    attemptRemoteSync = false,
    queueOnFailure = true,
    syncJobType = "intervention",
  } = options;

  await persistIntervention(intervention, false);

  if (attemptRemoteSync && hasSupabaseConfig) {
    try {
      await upsertRemoteIntervention(intervention);
      await persistIntervention(intervention, true);
    } catch (error) {
      if (queueOnFailure) {
        await enqueueSyncJob(
          syncJobType,
          intervention,
          error instanceof Error ? error.message : "Intervention sync failed."
        );
      }
    }
  } else if (queueOnFailure && hasSupabaseConfig) {
    await enqueueSyncJob(syncJobType, intervention, "Queued while the device is offline.");
  }
}

async function persistQuestions(questions: AnonymousQuestionPayload[]) {
  await persistQuestionsWithSyncState(questions, true);
}

async function persistQuestionsWithSyncState(
  questions: AnonymousQuestionPayload[],
  synced: boolean
) {
  if (questions.length === 0) {
    return;
  }

  const db = await getDatabase();
  const syncedAt = synced ? new Date().toISOString() : null;

  for (const question of questions) {
    const sanitizedQuestion = {
      ...question,
      anonymousId: sanitizeAnonymousId(question.anonymousId),
      text: sanitizeStudentQuestionText(question.text),
      language: sanitizeText(question.language, { maxLength: 24 }) || undefined,
    };

    await db.runAsync(
      UPSERT_QUESTION_SQL,
      sanitizedQuestion.id,
      sanitizedQuestion.sessionId,
      sanitizedQuestion.anonymousId,
      sanitizedQuestion.text,
      sanitizedQuestion.language ?? null,
      sanitizedQuestion.lessonMarkerId ?? null,
      sanitizedQuestion.timestamp,
      synced ? 1 : 0,
      syncedAt
    );
  }
}

export function buildFallbackClusters(args: {
  sessionId: string;
  questions: AnonymousQuestionPayload[];
  lessonMarkers: LessonMarker[];
  existingClusters: MisconceptionClusterSummary[];
  session?: SessionMeta | null;
}): MisconceptionClusterSummary[] {
  const { questions, lessonMarkers, existingClusters, session, sessionId } = args;

  type ClusterAccumulator = {
    id: string;
    reasonChip: ReasonChip;
    keywordAnchors: string[];
    keywordSet: Set<string>;
    lessonMarkerId?: string;
    studentIds: Set<string>;
    questions: AnonymousQuestionPayload[];
    updatedAt: string;
    createdAt: string;
  };

  const accumulators: ClusterAccumulator[] = [];

  [...questions]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .forEach((question) => {
      const reasonChip = inferReasonChip(question, session?.language);
      const keywordAnchors = getKeywordAnchors(question.text);
      const keywordSet = new Set(keywordAnchors);
      const lessonMarkerId = resolveQuestionLessonMarker(question, lessonMarkers);

      let bestMatch: ClusterAccumulator | null = null;
      let bestScore = 0;

      for (const candidate of accumulators) {
        const overlap = jaccardOverlap(candidate.keywordSet, keywordSet);
        let score = overlap;

        if (candidate.reasonChip === reasonChip) {
          score += 0.35;
        }

        if (candidate.lessonMarkerId && lessonMarkerId && candidate.lessonMarkerId === lessonMarkerId) {
          score += 0.2;
        }

        if (candidate.keywordSet.size === 0 && keywordSet.size === 0 && candidate.reasonChip === reasonChip) {
          score += 0.2;
        }

        if (score > bestScore) {
          bestMatch = candidate;
          bestScore = score;
        }
      }

      if (
        bestMatch &&
        (bestScore >= 0.55 ||
          (bestMatch.reasonChip === reasonChip &&
            ((bestMatch.lessonMarkerId && bestMatch.lessonMarkerId === lessonMarkerId) ||
              bestScore >= 0.35)))
      ) {
        bestMatch.keywordAnchors = mergeKeywordAnchors(bestMatch.keywordAnchors, keywordAnchors);
        bestMatch.keywordSet = new Set(bestMatch.keywordAnchors);
        bestMatch.studentIds.add(question.anonymousId);
        bestMatch.questions.push(question);
        bestMatch.updatedAt = bestMatch.updatedAt > question.timestamp ? bestMatch.updatedAt : question.timestamp;
        bestMatch.createdAt = bestMatch.createdAt < question.timestamp ? bestMatch.createdAt : question.timestamp;
        bestMatch.lessonMarkerId = bestMatch.lessonMarkerId ?? lessonMarkerId;
        return;
      }

      accumulators.push({
        id: buildClusterId(sessionId, reasonChip, lessonMarkerId, keywordAnchors),
        reasonChip,
        keywordAnchors,
        keywordSet: new Set(keywordAnchors),
        lessonMarkerId,
        studentIds: new Set([question.anonymousId]),
        questions: [question],
        updatedAt: question.timestamp,
        createdAt: question.timestamp,
      });
    });

  const existingClusterMap = new Map(existingClusters.map((cluster) => [cluster.id, cluster]));

  return accumulators
    .map((cluster) => {
      const persistedCluster = existingClusterMap.get(cluster.id);
      const affectedCount = cluster.studentIds.size;

      return {
        id: cluster.id,
        sessionId,
        title: sanitizeClusterTitle(
          buildClusterTitle(cluster.reasonChip, cluster.keywordAnchors)
        ),
        summary: sanitizeClusterSummary(
          buildClusterSummary(cluster.reasonChip, cluster.keywordAnchors, affectedCount)
        ),
        affectedCount,
        representativeQuestion: sanitizeRepresentativeQuestion(
          pickRepresentativeQuestion(cluster.questions) ?? cluster.questions[0]?.text ?? ""
        ),
        reasonChip: cluster.reasonChip,
        lessonMarkerId: cluster.lessonMarkerId,
        translation:
          sanitizeText(persistedCluster?.translation, {
            allowMultiline: true,
            maxLength: 240,
          }) || undefined,
        keywordAnchors: cluster.keywordAnchors,
        latestQuestionAt: cluster.updatedAt,
        source: "fallback",
        status: persistedCluster?.status ?? "active",
        suggestedInterventions:
          persistedCluster?.suggestedInterventions?.length
            ? persistedCluster.suggestedInterventions.map((value) =>
                sanitizeText(value, { maxLength: 120 })
              )
            : buildSuggestedInterventions(cluster.reasonChip, session).map((value) =>
                sanitizeText(value, { maxLength: 120 })
              ),
        createdAt: persistedCluster?.createdAt ?? cluster.createdAt,
        updatedAt: cluster.updatedAt,
      } satisfies MisconceptionClusterSummary;
    })
    .filter((cluster) => cluster.representativeQuestion.length > 0)
    .sort((left, right) => {
      if (right.affectedCount !== left.affectedCount) {
        return right.affectedCount - left.affectedCount;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .slice(0, 12);
}

export async function listCachedPulseSnapshots(
  sessionId: string,
  limit = 90
): Promise<PulseAggregateSnapshot[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PulseCacheRow>(
    `
      SELECT
        session_id,
        timestamp,
        got_it_count,
        sort_of_count,
        lost_count,
        total_active,
        disconnected_count,
        confusion_index
      FROM local_pulse_cache
      WHERE session_id = ?
      ORDER BY datetime(timestamp) DESC
      LIMIT ?;
    `,
    sessionId,
    limit
  );

  return rows.map((row) => normalizePulseCacheRow(row)).reverse();
}

export async function listCachedQuestions(
  sessionId: string,
  limit = 120
): Promise<AnonymousQuestionPayload[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<QuestionRow>(
    `
      SELECT
        id,
        session_id,
        anonymous_id,
        text,
        language,
        lesson_marker_id,
        timestamp
      FROM question_cache
      WHERE session_id = ?
      ORDER BY datetime(timestamp) DESC
      LIMIT ?;
    `,
    sessionId,
    limit
  );

  return rows.map((row) => normalizeQuestionRow(row));
}

export async function persistPulseSnapshot(snapshot: PulseAggregateSnapshot): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    INSERT_PULSE_CACHE_SQL,
    snapshot.sessionId,
    snapshot.timestamp,
    snapshot.gotItCount,
    snapshot.sortOfCount,
    snapshot.lostCount,
    snapshot.totalActive,
    snapshot.disconnectedCount,
    snapshot.confusionIndex
  );

  await db.runAsync(
    `
      DELETE FROM local_pulse_cache
      WHERE session_id = ?
        AND id NOT IN (
          SELECT id
          FROM local_pulse_cache
          WHERE session_id = ?
          ORDER BY datetime(timestamp) DESC
          LIMIT 360
        );
    `,
    snapshot.sessionId,
    snapshot.sessionId
  );
}

export async function recordLocalPulseEvent(
  event: PulseSignalEvent,
  options?: {
    session?: SessionMeta | null;
    source?: string;
  }
): Promise<PulseAggregateSnapshot> {
  const db = await getDatabase();

  await db.runAsync(
    UPSERT_LOCAL_PULSE_EVENT_SQL,
    `${event.sessionId}:${event.anonymousId}:${event.timestamp}`,
    event.sessionId,
    event.anonymousId,
    event.pulse,
    event.timestamp,
    options?.source ?? "local_hotspot",
    0,
    null
  );

  const localSnapshot = await deriveLocalSnapshotFromCache({
    sessionId: event.sessionId,
    session: options?.session,
  });

  if (localSnapshot.pulse) {
    await persistPulseSnapshot(localSnapshot.pulse);
  }

  if (hasSupabaseConfig) {
    await enqueueSyncJob(
      "pulse_batch",
      { sessionId: event.sessionId },
      "Queued while the device is offline."
    );
  }

  return (
    localSnapshot.pulse ?? {
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      gotItCount: event.pulse === "got_it" ? 1 : 0,
      sortOfCount: event.pulse === "sort_of" ? 1 : 0,
      lostCount: event.pulse === "lost" ? 1 : 0,
      totalActive: 1,
      disconnectedCount: 0,
      confusionIndex: computeConfusionIndex({
        gotItCount: event.pulse === "got_it" ? 1 : 0,
        sortOfCount: event.pulse === "sort_of" ? 1 : 0,
        lostCount: event.pulse === "lost" ? 1 : 0,
        totalActive: 1,
        disconnectedCount: 0,
      }),
    }
  );
}

export async function recordLocalQuestion(
  question: AnonymousQuestionPayload,
  options?: {
    session?: SessionMeta | null;
  }
): Promise<MisconceptionClusterSummary[]> {
  const sanitizedQuestion = {
    ...question,
    anonymousId: sanitizeAnonymousId(question.anonymousId),
    text: sanitizeStudentQuestionText(question.text),
    language: sanitizeText(question.language, { maxLength: 24 }) || undefined,
  };

  await persistQuestionsWithSyncState([sanitizedQuestion], false);

  addMonitoringBreadcrumb({
    category: "student-question",
    message: "Queued anonymous student question locally.",
    data: {
      sessionId: sanitizedQuestion.sessionId,
      hasLanguage: Boolean(sanitizedQuestion.language),
      textLength: sanitizedQuestion.text.length,
    },
  });

  const clusters = await refreshQuestionClusters({
    sessionId: sanitizedQuestion.sessionId,
    session: options?.session,
    force: true,
    preferLocal: true,
  });

  if (hasSupabaseConfig) {
    await enqueueSyncJob(
      "question_batch",
      { sessionId: sanitizedQuestion.sessionId },
      "Queued while the device is offline."
    );
  }

  return clusters;
}

export async function listLessonMarkers(sessionId: string): Promise<LessonMarker[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LessonMarkerRow>(
    `
      SELECT
        id,
        session_id,
        type,
        label,
        timestamp
      FROM lesson_markers
      WHERE session_id = ?
      ORDER BY datetime(timestamp) ASC;
    `,
    sessionId
  );

  return rows.map((row) => normalizeLessonMarkerRow(row));
}

async function upsertRemoteLessonMarker(marker: LessonMarker) {
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
}

async function persistLessonMarker(marker: LessonMarker, synced = false) {
  const db = await getDatabase();
  const syncedAt = synced ? new Date().toISOString() : null;

  await db.runAsync(
    UPSERT_LESSON_MARKER_SQL,
    marker.id,
    marker.sessionId,
    marker.type,
    marker.label ?? null,
    marker.timestamp,
    synced ? 1 : 0,
    syncedAt
  );
}

export async function createLessonMarker(args: {
  sessionId: string;
  type: LessonMarkerType;
  label?: string;
  timestamp?: string;
  attemptRemoteSync?: boolean;
  queueOnFailure?: boolean;
}): Promise<LessonMarker> {
  const marker: LessonMarker = {
    id: generateId("marker"),
    sessionId: args.sessionId,
    type: args.type,
    label: sanitizeText(args.label, { maxLength: 80 }) || undefined,
    timestamp: args.timestamp ?? new Date().toISOString(),
  };

  await persistLessonMarker(marker, false);

  if (args.attemptRemoteSync && hasSupabaseConfig) {
    try {
      await upsertRemoteLessonMarker(marker);
      await persistLessonMarker(marker, true);
    } catch (error) {
      if (args.queueOnFailure ?? true) {
        await enqueueSyncJob(
          "lesson_marker",
          marker,
          error instanceof Error ? error.message : "Lesson marker sync failed."
        );
      }
    }
  } else if ((args.queueOnFailure ?? true) && hasSupabaseConfig) {
    await enqueueSyncJob("lesson_marker", marker, "Queued while the device is offline.");
  }

  return marker;
}

export async function listInterventions(
  sessionId: string
): Promise<InterventionActionPayload[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<InterventionRow>(
    `
      SELECT
        id,
        session_id,
        type,
        cluster_id,
        lesson_marker_id,
        timestamp,
        confusion_before,
        confusion_after,
        recovery_score,
        recovery_window_seconds,
        duration_seconds,
        notes
      FROM intervention_history
      WHERE session_id = ?
      ORDER BY datetime(timestamp) ASC;
    `,
    sessionId
  );

  return rows.map((row) => normalizeInterventionRow(row));
}

export async function createIntervention(args: {
  sessionId: string;
  type: InterventionType;
  confusionBefore: number;
  recoveryWindowSeconds: number;
  clusterId?: string;
  lessonMarkerId?: string;
  confusionAfter?: number;
  recoveryScore?: number;
  durationSeconds?: number;
  notes?: string;
  timestamp?: string;
  attemptRemoteSync?: boolean;
  queueOnFailure?: boolean;
}): Promise<InterventionActionPayload> {
  const intervention: InterventionActionPayload = {
    id: generateId("intervention"),
    sessionId: args.sessionId,
    type: args.type,
    clusterId: args.clusterId,
    lessonMarkerId: args.lessonMarkerId,
    timestamp: args.timestamp ?? new Date().toISOString(),
    confusionBefore: args.confusionBefore,
    confusionAfter: args.confusionAfter,
    recoveryScore: args.recoveryScore,
    recoveryWindowSeconds: args.recoveryWindowSeconds,
    durationSeconds: args.durationSeconds,
    notes: sanitizeTeacherNote(args.notes) || undefined,
  };

  addMonitoringBreadcrumb({
    category: "intervention",
    message: "Teacher intervention logged.",
    data: {
      sessionId: intervention.sessionId,
      type: intervention.type,
      clusterId: intervention.clusterId,
    },
  });

  await saveIntervention(intervention, {
    attemptRemoteSync: args.attemptRemoteSync,
    queueOnFailure: args.queueOnFailure,
    syncJobType: "intervention",
  });

  return intervention;
}

export async function updateIntervention(
  intervention: InterventionActionPayload,
  options: InterventionMutationOptions = {}
): Promise<InterventionActionPayload> {
  await saveIntervention(intervention, {
    ...options,
    syncJobType: "intervention",
  });

  return intervention;
}

export async function refreshInterventions(
  sessionId: string
): Promise<InterventionActionPayload[]> {
  if (!hasSupabaseConfig) {
    return listInterventions(sessionId);
  }

  const remoteInterventions = await fetchRemoteInterventions(sessionId);
  if (remoteInterventions.length > 0) {
    await persistInterventions(remoteInterventions);
  }

  return listInterventions(sessionId);
}

export async function listCachedClusters(
  sessionId: string
): Promise<MisconceptionClusterSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ClusterRow>(
    `
      SELECT
        id,
        session_id,
        title,
        summary,
        affected_count,
        representative_question,
        reason_chip,
        lesson_marker_id,
        translation,
        status,
        suggested_interventions,
        created_at,
        updated_at
      FROM cluster_cache
      WHERE session_id = ?
      ORDER BY datetime(updated_at) DESC;
    `,
    sessionId
  );

  return rows.map((row) => normalizeClusterRow(row));
}

export async function clearCachedClusters(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM cluster_cache WHERE session_id = ?;", sessionId);
}

export async function persistClusters(
  clusters: MisconceptionClusterSummary[]
): Promise<void> {
  if (clusters.length === 0) {
    return;
  }

  const db = await getDatabase();

  for (const cluster of clusters) {
    const sanitizedCluster = {
      ...cluster,
      title: sanitizeClusterTitle(cluster.title),
      summary: sanitizeClusterSummary(cluster.summary),
      representativeQuestion: sanitizeRepresentativeQuestion(
        cluster.representativeQuestion
      ),
      translation:
        sanitizeText(cluster.translation, {
          allowMultiline: true,
          maxLength: 240,
        }) || undefined,
      suggestedInterventions: cluster.suggestedInterventions.map((value) =>
        sanitizeText(value, { maxLength: 120 })
      ),
    };

    await db.runAsync(
      UPSERT_CLUSTER_SQL,
      sanitizedCluster.id,
      sanitizedCluster.sessionId,
      sanitizedCluster.title,
      sanitizedCluster.summary,
      sanitizedCluster.affectedCount,
      sanitizedCluster.representativeQuestion,
      sanitizedCluster.reasonChip,
      sanitizedCluster.lessonMarkerId ?? null,
      sanitizedCluster.translation ?? null,
      sanitizedCluster.status,
      JSON.stringify(sanitizedCluster.suggestedInterventions),
      sanitizedCluster.createdAt,
      sanitizedCluster.updatedAt
    );
  }
}

export async function refreshQuestionClusters(args: {
  sessionId: string;
  session?: SessionMeta | null;
  lessonMarkers?: LessonMarker[];
  force?: boolean;
  preferLocal?: boolean;
}): Promise<MisconceptionClusterSummary[]> {
  const { sessionId, session, force = false, preferLocal = false } = args;
  const lessonMarkers = args.lessonMarkers ?? (await listLessonMarkers(sessionId));
  const existingClusters = await listCachedClusters(sessionId);

  if (!hasSupabaseConfig || preferLocal) {
    const cachedQuestions = await listCachedQuestions(sessionId);
    const fallbackClusters = buildFallbackClusters({
      sessionId,
      questions: cachedQuestions,
      lessonMarkers,
      existingClusters,
      session,
    });
    if (fallbackClusters.length === 0) {
      await clearCachedClusters(sessionId);
    }
    await persistClusters(fallbackClusters);
    return fallbackClusters;
  }

  let questions: AnonymousQuestionPayload[] = [];

  try {
    questions = await fetchRemoteQuestions(sessionId);
    await persistQuestions(questions);
  } catch (error) {
    questions = await listCachedQuestions(sessionId);
    if (questions.length === 0) {
      throw error;
    }
  }

  if (questions.length === 0) {
    await clearCachedClusters(sessionId);
    return [];
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      questionClusteringFunction,
      {
        body: {
          sessionId,
          force,
          lessonMarkers,
          sessionLanguage: session?.language,
        },
      }
    );

    if (error) {
      throw error;
    }

    const clusterRows =
      typeof data === "object" &&
      data !== null &&
      "clusters" in data &&
      Array.isArray((data as { clusters?: unknown[] }).clusters)
        ? (data as { clusters: UnknownRow[] }).clusters
        : [];

    const clusters = clusterRows
      .map((row) => normalizeRemoteCluster(row))
      .filter((row): row is MisconceptionClusterSummary => Boolean(row));

    if (clusters.length > 0) {
      await persistClusters(clusters);
      return clusters;
    }
  } catch {
    // Fall through to the deterministic keyword-based grouping below.
  }

  const fallbackClusters = buildFallbackClusters({
    sessionId,
    questions,
    lessonMarkers,
    existingClusters,
    session,
  });

  if (fallbackClusters.length === 0) {
    await clearCachedClusters(sessionId);
  }
  await persistClusters(fallbackClusters);
  return fallbackClusters;
}

export async function updateClusterStatus(args: {
  sessionId: string;
  clusterId: string;
  status: ClusterStatus;
}): Promise<void> {
  const db = await getDatabase();
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    `
      UPDATE cluster_cache
      SET status = ?, updated_at = ?
      WHERE session_id = ? AND id = ?;
    `,
    args.status,
    updatedAt,
    args.sessionId,
    args.clusterId
  );

  if (!hasSupabaseConfig) {
    return;
  }

  try {
    const { error } = await supabase
      .from(clustersTable)
      .update({
        status: args.status,
        updated_at: updatedAt,
      })
      .eq("session_id", args.sessionId)
      .eq("id", args.clusterId);

    if (error) {
      throw error;
    }
  } catch (error) {
    await queueSyncJob({
      type: "cluster_update",
      payload: {
        sessionId: args.sessionId,
        clusterId: args.clusterId,
        status: args.status,
        updatedAt,
      },
      sessionId: args.sessionId,
      jobKey: `cluster_update:${args.clusterId}`,
      errorMessage:
        error instanceof Error ? error.message : "Cluster status sync failed.",
      dedupe: "replace",
    });
  }
}

export async function fetchLiveSessionSnapshot(
  sessionId: string,
  options?: {
    clusterRefresh?: "none" | "ensure" | "force";
    lessonMarkers?: LessonMarker[];
    session?: SessionMeta | null;
    preferLocal?: boolean;
  }
): Promise<LiveSessionSnapshot> {
  if (!hasSupabaseConfig || options?.preferLocal) {
    const clusterRefresh = options?.clusterRefresh ?? "none";

    if (clusterRefresh !== "none") {
      try {
        const nextClusters = await refreshQuestionClusters({
          sessionId,
          lessonMarkers: options?.lessonMarkers,
          session: options?.session,
          force: clusterRefresh === "force",
          preferLocal: true,
        });
        await persistClusters(nextClusters);
      } catch {
        // Fall back to whatever is already cached locally.
      }
    }

    return deriveLocalSnapshotFromCache({
      sessionId,
      session: options?.session,
    });
  }

  let refreshedClusters: MisconceptionClusterSummary[] | null = null;
  const clusterRefresh = options?.clusterRefresh ?? "none";

  if (clusterRefresh !== "none") {
    try {
      refreshedClusters = await refreshQuestionClusters({
        sessionId,
        lessonMarkers: options?.lessonMarkers,
        session: options?.session,
        force: clusterRefresh === "force",
        preferLocal: false,
      });
    } catch {
      refreshedClusters = null;
    }
  }

  const sampledAt = new Date().toISOString();
  const [participantRowsResult, pulseRowsResult, clustersResult] =
    await Promise.allSettled([
      fetchParticipantRows(sessionId),
      fetchPulseRows(
        sessionId,
        Math.max(1_200, (options?.session?.participantCount ?? 0) * 6)
      ),
      refreshedClusters ? Promise.resolve(refreshedClusters) : fetchRemoteClusters(sessionId),
    ]);

  const participantRows =
    participantRowsResult.status === "fulfilled" ? participantRowsResult.value : [];
  const participantRoster = normalizeParticipantRoster(participantRows);
  const pulseRows =
    pulseRowsResult.status === "fulfilled" ? pulseRowsResult.value : [];
  const remotePulseEvents = pulseRows
    .map((row) => normalizeRemotePulseEvent(row))
    .filter((row): row is PulseSignalEvent => Boolean(row));

  if (remotePulseEvents.length > 0) {
    await persistPulseEvents(remotePulseEvents, true);
  }

  const pulse = deriveLiveSnapshotFromEvents(
    sessionId,
    pulseRows,
    sampledAt,
    participantRoster
  );
  const clusters =
    clustersResult.status === "fulfilled" ? clustersResult.value : [];

  if (
    participantRowsResult.status === "rejected" &&
    pulseRowsResult.status === "rejected"
  ) {
    captureMonitoringException(
      participantRowsResult.reason ?? pulseRowsResult.reason,
      {
        component: "liveSession.fetchLiveSessionSnapshot",
        data: { sessionId },
      }
    );
    return deriveLocalSnapshotFromCache({
      sessionId,
      session: options?.session,
    });
  }

  return {
    pulse,
    clusters,
    participantRoster,
  };
}

export function subscribeToLiveSession(
  sessionId: string,
  callbacks: LiveSessionSubscriptionCallbacks
) {
  if (!hasSupabaseConfig) {
    callbacks.onStatusChange?.("disabled");
    return () => undefined;
  }

  const channel = supabase.channel(`session-live:${sessionId}`);

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: pulseEventsTable,
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      callbacks.onPulseEvent?.();
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
      callbacks.onParticipantEvent?.();
    }
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: questionsTable,
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      callbacks.onQuestionEvent?.();
    }
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: clustersTable,
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      callbacks.onClusterEvent?.();
    }
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: interventionsTable,
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      callbacks.onInterventionEvent?.();
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
