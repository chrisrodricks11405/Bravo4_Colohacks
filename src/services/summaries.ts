import { getDatabase } from "../db";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { queueSyncJob } from "./syncJobs";
import type {
  AISessionSummary,
  ConfusionTrendPoint,
  InterventionActionPayload,
  InterventionEffectiveness,
  PeakMoment,
  PulseAggregateSnapshot,
  PollSummaryInsight,
  ReasonChip,
  ReasonChipCount,
  SessionMeta,
  SessionSummaryAIInput,
  SessionSummaryPayload,
} from "../types";
import { aiProvider } from "./ai";
import {
  buildTrendPoint,
  computeLostPercent,
  listCachedClusters,
  listCachedPulseSnapshots,
  listInterventions,
  listLessonMarkers,
  refreshQuestionClusters,
} from "./liveSession";
import { getPollDistribution, listCachedPolls } from "./polls";

type UnknownRow = Record<string, unknown>;

type SessionSummaryRow = {
  id: string;
  session_id: string;
  teacher_id: string | null;
  subject: string;
  topic: string;
  grade_class: string;
  duration: number;
  participant_count: number;
  recovery_score: number;
  summary_source: string;
  ai_narrative_summary: string | null;
  suggested_next_activity: string | null;
  voice_reflection_uri: string | null;
  voice_reflection_transcript: string | null;
  search_index: string | null;
  payload: string;
  synced: number;
  created_at: string;
  updated_at: string;
};

type SummaryMutationOptions = {
  attemptRemoteSync?: boolean;
  queueOnFailure?: boolean;
};

type SummarySyncResult = {
  syncedCount: number;
  syncedAt: string | null;
  source: "local" | "supabase";
};

type SummaryQueryOptions = {
  limit?: number;
  query?: string;
  startDate?: string;
  endDate?: string;
};

type SummarySyncOptions = {
  limit?: number;
  startDate?: string;
  endDate?: string;
};

const sessionSummariesTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_SUMMARIES_TABLE ?? "session_summaries";

const UPSERT_SESSION_SUMMARY_SQL = `
  INSERT INTO session_summaries (
    id,
    session_id,
    teacher_id,
    subject,
    topic,
    grade_class,
    duration,
    participant_count,
    recovery_score,
    summary_source,
    ai_narrative_summary,
    suggested_next_activity,
    voice_reflection_uri,
    voice_reflection_transcript,
    search_index,
    payload,
    synced,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    id = excluded.id,
    teacher_id = excluded.teacher_id,
    subject = excluded.subject,
    topic = excluded.topic,
    grade_class = excluded.grade_class,
    duration = excluded.duration,
    participant_count = excluded.participant_count,
    recovery_score = excluded.recovery_score,
    summary_source = excluded.summary_source,
    ai_narrative_summary = excluded.ai_narrative_summary,
    suggested_next_activity = excluded.suggested_next_activity,
    voice_reflection_uri = excluded.voice_reflection_uri,
    voice_reflection_transcript = excluded.voice_reflection_transcript,
    search_index = excluded.search_index,
    payload = excluded.payload,
    synced = excluded.synced,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;
`;

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

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function toRangeStartIso(dateKey?: string) {
  if (!dateKey) {
    return null;
  }

  const date = parseDateKey(dateKey);
  if (!date) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function toRangeEndExclusiveIso(dateKey?: string) {
  if (!dateKey) {
    return null;
  }

  const date = parseDateKey(dateKey);
  if (!date) {
    return null;
  }

  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
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

function readBoolean(row: UnknownRow, ...keys: string[]) {
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

function normalizeSummarySource(value?: string | null): SessionSummaryPayload["summarySource"] {
  return value === "edge" ? "edge" : "fallback";
}

function formatClockTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMarkerType(type?: string) {
  switch (type) {
    case "new_concept":
      return "New concept";
    case "example":
      return "Example";
    case "practice":
      return "Practice";
    case "review":
      return "Review";
    case "question_time":
      return "Q&A";
    default:
      return "Marker";
  }
}

function formatDateSearchTokens(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return [
    value,
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date),
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date),
  ].join(" ");
}

function buildHydratedTrend(
  snapshots: PulseAggregateSnapshot[],
  interventions: InterventionActionPayload[]
) {
  const basePoints = snapshots.map((snapshot) => buildTrendPoint(snapshot));

  if (snapshots.length === 0 || interventions.length === 0) {
    return basePoints.slice(-300);
  }

  const interventionPoints = interventions
    .map((intervention) => {
      const contextSnapshot =
        [...snapshots]
          .reverse()
          .find((snapshot) => snapshot.timestamp <= intervention.timestamp) ??
        snapshots[snapshots.length - 1];

      if (!contextSnapshot) {
        return null;
      }

      return buildTrendPoint(
        {
          ...contextSnapshot,
          timestamp: intervention.timestamp,
        },
        intervention.id
      );
    })
    .filter((point): point is ConfusionTrendPoint => Boolean(point));

  return [...basePoints, ...interventionPoints]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .slice(-300);
}

function buildRecoveryTrendSamples(trend: ConfusionTrendPoint[]) {
  return trend
    .filter((point) => !point.hasInterventionMarker)
    .map((point) => ({
      timestamp: point.timestamp,
      confusionIndex: point.confusionIndex,
    }))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function averageConfusionBetween(
  samples: { timestamp: string; confusionIndex: number }[],
  startMs: number,
  endMs: number,
  fallbackValue: number
) {
  const windowPoints = samples.filter((sample) => {
    const sampleMs = new Date(sample.timestamp).getTime();
    return Number.isFinite(sampleMs) && sampleMs >= startMs && sampleMs <= endMs;
  });

  if (windowPoints.length === 0) {
    return fallbackValue;
  }

  const total = windowPoints.reduce((sum, sample) => sum + sample.confusionIndex, 0);
  return Math.round((total / windowPoints.length) * 10) / 10;
}

function settleIntervention(
  intervention: InterventionActionPayload,
  trend: ConfusionTrendPoint[],
  sessionEndMs: number
) {
  if (intervention.confusionAfter != null && intervention.recoveryScore != null) {
    return intervention;
  }

  const interventionMs = new Date(intervention.timestamp).getTime();
  if (!Number.isFinite(interventionMs)) {
    return intervention;
  }

  const samples = buildRecoveryTrendSamples(trend);
  const windowEndMs = Math.min(
    interventionMs + intervention.recoveryWindowSeconds * 1_000,
    sessionEndMs
  );
  const afterSamples = samples.filter((sample) => {
    const sampleMs = new Date(sample.timestamp).getTime();
    return Number.isFinite(sampleMs) && sampleMs > interventionMs && sampleMs <= windowEndMs;
  });
  const fallbackAfterSample = [...samples]
    .reverse()
    .find((sample) => {
      const sampleMs = new Date(sample.timestamp).getTime();
      return Number.isFinite(sampleMs) && sampleMs > interventionMs && sampleMs <= sessionEndMs;
    });

  if (afterSamples.length === 0 && !fallbackAfterSample) {
    return intervention;
  }

  const confusionAfter =
    afterSamples.length > 0
      ? averageConfusionBetween(
          afterSamples,
          interventionMs + 1,
          windowEndMs,
          afterSamples[afterSamples.length - 1]?.confusionIndex ??
            intervention.confusionBefore
        )
      : fallbackAfterSample?.confusionIndex ?? intervention.confusionBefore;
  const recoveryScore =
    Math.round((intervention.confusionBefore - confusionAfter) * 10) / 10;

  return {
    ...intervention,
    confusionAfter,
    recoveryScore,
  };
}

function buildPeakLabel(timestamp: string, markerItems: SessionSummaryPayload["lessonMarkers"]) {
  const targetMs = new Date(timestamp).getTime();
  const closestMarker = [...markerItems]
    .map((marker) => ({
      marker,
      distance: Math.abs(new Date(marker.timestamp).getTime() - targetMs),
    }))
    .sort((left, right) => left.distance - right.distance)[0];

  if (closestMarker && closestMarker.distance <= 120_000) {
    return closestMarker.marker.label
      ? `${formatMarkerType(closestMarker.marker.type)}: ${closestMarker.marker.label}`
      : formatMarkerType(closestMarker.marker.type);
  }

  return formatClockTime(timestamp);
}

function derivePeakConfusionMoments(
  trend: ConfusionTrendPoint[],
  lessonMarkers: SessionSummaryPayload["lessonMarkers"]
): PeakMoment[] {
  if (trend.length === 0) {
    return [];
  }

  const candidates = trend.filter((point, index) => {
    const previous = trend[index - 1];
    const next = trend[index + 1];
    const previousValue = previous?.confusionIndex ?? -1;
    const nextValue = next?.confusionIndex ?? -1;

    return point.confusionIndex >= previousValue && point.confusionIndex >= nextValue;
  });

  const sortedCandidates = (candidates.length > 0 ? candidates : trend)
    .map((point) => ({
      timestamp: point.timestamp,
      confusionIndex: point.confusionIndex,
      lostPercent: point.lostPercent,
      label: buildPeakLabel(point.timestamp, lessonMarkers),
    }))
    .sort(
      (left, right) =>
        right.confusionIndex - left.confusionIndex ||
        left.timestamp.localeCompare(right.timestamp)
    );

  const selected: PeakMoment[] = [];

  for (const candidate of sortedCandidates) {
    const candidateMs = new Date(candidate.timestamp).getTime();
    const overlapsExisting = selected.some((peak) => {
      const peakMs = new Date(peak.timestamp).getTime();
      return Math.abs(candidateMs - peakMs) < 90_000;
    });

    if (!overlapsExisting) {
      selected.push(candidate);
    }

    if (selected.length >= 3) {
      break;
    }
  }

  return selected.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function aggregateReasonChips(
  clusters: SessionSummaryPayload["topClusters"]
): ReasonChipCount[] {
  const counts = new Map<ReasonChip, number>();

  clusters.forEach((cluster) => {
    counts.set(cluster.reasonChip, (counts.get(cluster.reasonChip) ?? 0) + Math.max(cluster.affectedCount, 1));
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([chip, count]) => ({ chip, count }));
}

function aggregateInterventionStats(
  interventions: InterventionActionPayload[]
): InterventionEffectiveness[] {
  const grouped = new Map<string, InterventionActionPayload[]>();

  interventions.forEach((intervention) => {
    const bucket = grouped.get(intervention.type) ?? [];
    bucket.push(intervention);
    grouped.set(intervention.type, bucket);
  });

  return [...grouped.entries()]
    .map(([type, items]) => {
      const measured = items.filter(
        (item): item is InterventionActionPayload & { recoveryScore: number } =>
          typeof item.recoveryScore === "number"
      );
      const avgRecoveryScore =
        measured.length > 0
          ? Math.round(
              (measured.reduce((sum, item) => sum + item.recoveryScore, 0) /
                measured.length) *
                10
            ) / 10
          : undefined;

      return {
        type: type as InterventionEffectiveness["type"],
        count: items.length,
        avgRecoveryScore,
        successfulCount: measured.filter((item) => item.recoveryScore > 0).length,
        unresolvedCount: items.length - measured.length,
      };
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        (right.avgRecoveryScore ?? -Infinity) - (left.avgRecoveryScore ?? -Infinity)
    );
}

async function computeDominantPollInsight(
  sessionId: string
): Promise<PollSummaryInsight | undefined> {
  const polls = await listCachedPolls(sessionId, 20);
  if (polls.length === 0) {
    return undefined;
  }

  const insights = await Promise.all(
    polls.map(async (poll) => {
      const distribution = await getPollDistribution(poll);
      if (
        distribution.totalResponses === 0 ||
        distribution.leadingOptionIndex == null
      ) {
        return null;
      }

      const leadingOption = poll.options.find(
        (option) => option.index === distribution.leadingOptionIndex
      );
      const leadingDistribution = distribution.distribution.find(
        (entry) => entry.optionIndex === distribution.leadingOptionIndex
      );

      if (!leadingOption || !leadingDistribution) {
        return null;
      }

      return {
        pollId: poll.id,
        question: poll.question,
        leadingOptionText: leadingOption.text,
        leadingOptionPercent: leadingDistribution.percent,
        totalResponses: distribution.totalResponses,
        updatedAt: poll.updatedAt,
      };
    })
  );

  const best = insights
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort(
      (left, right) =>
        right.totalResponses - left.totalResponses ||
        right.updatedAt.localeCompare(left.updatedAt)
    )[0];

  if (!best) {
    return undefined;
  }

  return {
    pollId: best.pollId,
    question: best.question,
    leadingOptionText: best.leadingOptionText,
    leadingOptionPercent: best.leadingOptionPercent,
    totalResponses: best.totalResponses,
  };
}

function computeOverallRecoveryScore(peakConfusionIndex: number, endingConfusionIndex: number) {
  if (peakConfusionIndex <= 0) {
    return clamp(Math.round(100 - endingConfusionIndex), 0, 100);
  }

  return clamp(
    Math.round(((peakConfusionIndex - endingConfusionIndex) / peakConfusionIndex) * 100),
    0,
    100
  );
}

function buildSummarySearchIndex(summary: SessionSummaryPayload) {
  return [
    summary.subject,
    summary.topic,
    summary.gradeClass,
    formatDateSearchTokens(summary.createdAt),
    summary.aiNarrativeSummary ?? "",
    summary.suggestedNextActivity ?? "",
    summary.topClusters.map((cluster) => cluster.title).join(" "),
    summary.topReasonChips.map((chip) => chip.chip.replace(/_/g, " ")).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function buildSummaryAIInput(summary: SessionSummaryPayload): SessionSummaryAIInput {
  const bestIntervention = [...summary.interventionStats]
    .filter(
      (item): item is InterventionEffectiveness & { avgRecoveryScore: number } =>
        typeof item.avgRecoveryScore === "number"
    )
    .sort(
      (left, right) =>
        right.avgRecoveryScore - left.avgRecoveryScore || right.count - left.count
    )[0];

  return {
    subject: summary.subject,
    topic: summary.topic,
    gradeClass: summary.gradeClass,
    durationMinutes: summary.duration,
    totalParticipants: summary.totalParticipants,
    peakMomentLabel: summary.peakConfusionMoments[0]?.label,
    peakConfusionIndex: summary.peakConfusionIndex,
    peakLostPercent: summary.peakLostPercent,
    endingConfusionIndex: summary.endingConfusionIndex,
    endingLostPercent: summary.endingLostPercent,
    topClusterTitle: summary.topClusters[0]?.title,
    topClusterAffectedCount: summary.topClusters[0]?.affectedCount,
    topReasonChip: summary.topReasonChips[0]?.chip,
    dominantPollOption: summary.dominantPollInsight?.leadingOptionText,
    dominantPollPercent: summary.dominantPollInsight?.leadingOptionPercent,
    bestInterventionType: bestIntervention?.type,
    bestInterventionRecovery: bestIntervention?.avgRecoveryScore,
    recoveryScore: summary.overallRecoveryScore,
  };
}

function buildSummaryId(sessionId: string) {
  return `summary_${sessionId}`;
}

function buildFallbackSummary(row: {
  id: string;
  sessionId: string;
  teacherId?: string;
  subject: string;
  topic: string;
  gradeClass: string;
  duration: number;
  totalParticipants: number;
  overallRecoveryScore: number;
  summarySource: SessionSummaryPayload["summarySource"];
  aiNarrativeSummary?: string;
  suggestedNextActivity?: string;
  voiceReflectionUri?: string;
  voiceReflectionTranscript?: string;
  createdAt: string;
  updatedAt?: string;
  synced?: boolean;
}) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    teacherId: row.teacherId,
    subject: row.subject,
    topic: row.topic,
    gradeClass: row.gradeClass,
    duration: row.duration,
    totalParticipants: row.totalParticipants,
    comprehensionTimeline: [],
    peakConfusionMoments: [],
    topClusters: [],
    topReasonChips: [],
    lessonMarkers: [],
    interventions: [],
    interventionStats: [],
    peakConfusionIndex: 0,
    endingConfusionIndex: 0,
    peakLostPercent: 0,
    endingLostPercent: 0,
    overallRecoveryScore: row.overallRecoveryScore,
    aiNarrativeSummary: row.aiNarrativeSummary,
    suggestedNextActivity: row.suggestedNextActivity,
    voiceReflectionUri: row.voiceReflectionUri,
    voiceReflectionTranscript: row.voiceReflectionTranscript,
    summarySource: row.summarySource,
    synced: row.synced,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } satisfies SessionSummaryPayload;
}

function mergeStoredSummary(
  payload: SessionSummaryPayload | null,
  row: {
    id: string;
    sessionId: string;
    teacherId?: string;
    subject: string;
    topic: string;
    gradeClass: string;
    duration: number;
    totalParticipants: number;
    overallRecoveryScore: number;
    summarySource: SessionSummaryPayload["summarySource"];
    aiNarrativeSummary?: string | null;
    suggestedNextActivity?: string | null;
    voiceReflectionUri?: string | null;
    voiceReflectionTranscript?: string | null;
    createdAt: string;
    updatedAt?: string;
    synced?: boolean;
  }
) {
  const fallback = buildFallbackSummary({
    ...row,
    aiNarrativeSummary: row.aiNarrativeSummary ?? undefined,
    suggestedNextActivity: row.suggestedNextActivity ?? undefined,
    voiceReflectionUri: row.voiceReflectionUri ?? undefined,
    voiceReflectionTranscript: row.voiceReflectionTranscript ?? undefined,
  });

  if (!payload) {
    return fallback;
  }

  return {
    ...fallback,
    ...payload,
    id: payload.id || fallback.id,
    sessionId: payload.sessionId || fallback.sessionId,
    teacherId: payload.teacherId ?? fallback.teacherId,
    subject: payload.subject || fallback.subject,
    topic: payload.topic || fallback.topic,
    gradeClass: payload.gradeClass || fallback.gradeClass,
    duration: payload.duration ?? fallback.duration,
    totalParticipants: payload.totalParticipants ?? fallback.totalParticipants,
    overallRecoveryScore: payload.overallRecoveryScore ?? fallback.overallRecoveryScore,
    aiNarrativeSummary:
      payload.aiNarrativeSummary ?? row.aiNarrativeSummary ?? fallback.aiNarrativeSummary,
    suggestedNextActivity:
      payload.suggestedNextActivity ??
      row.suggestedNextActivity ??
      fallback.suggestedNextActivity,
    voiceReflectionUri:
      payload.voiceReflectionUri ?? row.voiceReflectionUri ?? fallback.voiceReflectionUri,
    voiceReflectionTranscript:
      payload.voiceReflectionTranscript ??
      row.voiceReflectionTranscript ??
      fallback.voiceReflectionTranscript,
    summarySource:
      payload.summarySource ?? row.summarySource ?? fallback.summarySource,
    createdAt: payload.createdAt || fallback.createdAt,
    updatedAt: payload.updatedAt ?? row.updatedAt ?? fallback.updatedAt,
    synced: row.synced ?? payload.synced ?? fallback.synced,
  } satisfies SessionSummaryPayload;
}

function normalizeLocalSummary(row: SessionSummaryRow): SessionSummaryPayload {
  let payload: SessionSummaryPayload | null = null;

  try {
    payload = JSON.parse(row.payload) as SessionSummaryPayload;
  } catch {
    payload = null;
  }

  return mergeStoredSummary(payload, {
    id: row.id,
    sessionId: row.session_id,
    teacherId: row.teacher_id ?? undefined,
    subject: row.subject,
    topic: row.topic,
    gradeClass: row.grade_class,
    duration: row.duration,
    totalParticipants: row.participant_count,
    overallRecoveryScore: row.recovery_score,
    summarySource: normalizeSummarySource(row.summary_source),
    aiNarrativeSummary: row.ai_narrative_summary,
    suggestedNextActivity: row.suggested_next_activity,
    voiceReflectionUri: row.voice_reflection_uri,
    voiceReflectionTranscript: row.voice_reflection_transcript,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    synced: Boolean(row.synced),
  });
}

function normalizeRemoteSummary(row: UnknownRow): SessionSummaryPayload | null {
  const id = readString(row, "id");
  const sessionId = readString(row, "session_id", "sessionId");
  const subject = readString(row, "subject");
  const topic = readString(row, "topic");
  const gradeClass = readString(row, "grade_class", "gradeClass");
  const createdAt = readString(row, "created_at", "createdAt");

  if (!id || !sessionId || !subject || !topic || !gradeClass || !createdAt) {
    return null;
  }

  const payloadValue = row.payload;
  let payload: SessionSummaryPayload | null = null;

  if (typeof payloadValue === "string") {
    try {
      payload = JSON.parse(payloadValue) as SessionSummaryPayload;
    } catch {
      payload = null;
    }
  } else if (payloadValue && typeof payloadValue === "object") {
    payload = payloadValue as SessionSummaryPayload;
  }

  return mergeStoredSummary(payload, {
    id,
    sessionId,
    teacherId: readString(row, "teacher_id", "teacherId") ?? undefined,
    subject,
    topic,
    gradeClass,
    duration: readNumber(row, "duration") ?? 0,
    totalParticipants: readNumber(row, "participant_count", "participantCount") ?? 0,
    overallRecoveryScore:
      readNumber(row, "recovery_score", "recoveryScore") ?? 0,
    summarySource: normalizeSummarySource(readString(row, "summary_source", "summarySource")),
    aiNarrativeSummary:
      readString(row, "ai_narrative_summary", "aiNarrativeSummary") ?? undefined,
    suggestedNextActivity:
      readString(row, "suggested_next_activity", "suggestedNextActivity") ?? undefined,
    voiceReflectionUri:
      readString(row, "voice_reflection_uri", "voiceReflectionUri") ?? undefined,
    voiceReflectionTranscript:
      readString(
        row,
        "voice_reflection_transcript",
        "voiceReflectionTranscript"
      ) ?? undefined,
    createdAt: toIsoString(createdAt),
    updatedAt:
      readString(row, "updated_at", "updatedAt") != null
        ? toIsoString(readString(row, "updated_at", "updatedAt"))
        : undefined,
    synced: readBoolean(row, "synced"),
  });
}

function summaryToRemoteRow(summary: SessionSummaryPayload) {
  return {
    id: summary.id,
    session_id: summary.sessionId,
    teacher_id: summary.teacherId ?? null,
    subject: summary.subject,
    topic: summary.topic,
    grade_class: summary.gradeClass,
    duration: summary.duration,
    participant_count: summary.totalParticipants,
    recovery_score: summary.overallRecoveryScore,
    summary_source: summary.summarySource,
    ai_narrative_summary: summary.aiNarrativeSummary ?? null,
    suggested_next_activity: summary.suggestedNextActivity ?? null,
    voice_reflection_uri: summary.voiceReflectionUri ?? null,
    voice_reflection_transcript: summary.voiceReflectionTranscript ?? null,
    payload: summary,
    created_at: summary.createdAt,
    updated_at: summary.updatedAt ?? summary.createdAt,
  };
}

async function persistLocalSummary(
  summary: SessionSummaryPayload,
  synced: boolean
): Promise<SessionSummaryPayload> {
  const db = await getDatabase();
  const updatedSummary: SessionSummaryPayload = {
    ...summary,
    synced,
    updatedAt: summary.updatedAt ?? summary.createdAt,
  };
  const updatedAt = updatedSummary.updatedAt ?? updatedSummary.createdAt;

  await db.runAsync(
    UPSERT_SESSION_SUMMARY_SQL,
    updatedSummary.id,
    updatedSummary.sessionId,
    updatedSummary.teacherId ?? null,
    updatedSummary.subject,
    updatedSummary.topic,
    updatedSummary.gradeClass,
    updatedSummary.duration,
    updatedSummary.totalParticipants,
    updatedSummary.overallRecoveryScore,
    updatedSummary.summarySource,
    updatedSummary.aiNarrativeSummary ?? null,
    updatedSummary.suggestedNextActivity ?? null,
    updatedSummary.voiceReflectionUri ?? null,
    updatedSummary.voiceReflectionTranscript ?? null,
    buildSummarySearchIndex(updatedSummary),
    JSON.stringify(updatedSummary),
    synced ? 1 : 0,
    updatedSummary.createdAt,
    updatedAt
  );

  return updatedSummary;
}

async function enqueueSyncJob(
  summary: SessionSummaryPayload,
  errorMessage?: string
) {
  await queueSyncJob({
    type: "summary",
    payload: summaryToRemoteRow(summary),
    sessionId: summary.sessionId,
    jobKey: `summary:${summary.sessionId}`,
    errorMessage,
    dedupe: "replace",
  });
}

async function upsertRemoteSummary(summary: SessionSummaryPayload) {
  const { error } = await supabase
    .from(sessionSummariesTable)
    .upsert(summaryToRemoteRow(summary), { onConflict: "session_id" });

  if (error) {
    throw error;
  }
}

async function saveSessionSummaryInternal(
  summary: SessionSummaryPayload,
  options: SummaryMutationOptions = {}
) {
  const { attemptRemoteSync = false, queueOnFailure = true } = options;

  let synced = false;
  await persistLocalSummary(summary, false);

  if (attemptRemoteSync && hasSupabaseConfig) {
    try {
      await upsertRemoteSummary(summary);
      synced = true;
    } catch (error) {
      if (queueOnFailure) {
        await enqueueSyncJob(
          summary,
          error instanceof Error ? error.message : "Summary sync failed."
        );
      }
    }
  } else if (queueOnFailure && hasSupabaseConfig) {
    await enqueueSyncJob(summary, "Queued while the device is offline.");
  }

  return persistLocalSummary(summary, synced);
}

export async function getSessionSummary(
  sessionId: string
): Promise<SessionSummaryPayload | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SessionSummaryRow>(
    `
      SELECT *
      FROM session_summaries
      WHERE session_id = ?
      LIMIT 1;
    `,
    sessionId
  );

  return row ? normalizeLocalSummary(row) : null;
}

export async function listSessionSummaries(
  options?: SummaryQueryOptions
): Promise<SessionSummaryPayload[]> {
  const db = await getDatabase();
  const limit = options?.limit;
  const normalizedQuery = options?.query?.trim().toLowerCase() ?? "";
  const searchPattern = `%${normalizedQuery}%`;
  const filters: string[] = [];
  const params: Array<string | number> = [];
  const rangeStart = toRangeStartIso(options?.startDate);
  const rangeEndExclusive = toRangeEndExclusiveIso(options?.endDate);

  if (normalizedQuery) {
    filters.push("search_index LIKE ?");
    params.push(searchPattern);
  }

  if (rangeStart) {
    filters.push("datetime(created_at) >= datetime(?)");
    params.push(rangeStart);
  }

  if (rangeEndExclusive) {
    filters.push("datetime(created_at) < datetime(?)");
    params.push(rangeEndExclusive);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const limitClause = typeof limit === "number" ? "LIMIT ?;" : ";";
  if (typeof limit === "number") {
    params.push(limit);
  }

  const rows = await db.getAllAsync<SessionSummaryRow>(
    `
      SELECT *
      FROM session_summaries
      ${whereClause}
      ORDER BY datetime(created_at) DESC
      ${limitClause}
    `,
    ...params
  );

  return rows.map((row) => normalizeLocalSummary(row));
}

async function fetchRemoteSummaries(
  teacherId: string,
  options: SummarySyncOptions = {}
): Promise<SessionSummaryPayload[]> {
  if (!hasSupabaseConfig) {
    return [];
  }

  let query = supabase
    .from(sessionSummariesTable)
    .select("*")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });

  const rangeStart = toRangeStartIso(options.startDate);
  const rangeEndExclusive = toRangeEndExclusiveIso(options.endDate);

  if (rangeStart) {
    query = query.gte("created_at", rangeStart);
  }

  if (rangeEndExclusive) {
    query = query.lt("created_at", rangeEndExclusive);
  }

  if (typeof options.limit === "number") {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data as UnknownRow[] | null) ?? [])
    .map((row) => normalizeRemoteSummary(row))
    .filter((row): row is SessionSummaryPayload => Boolean(row));
}

export async function syncSessionSummariesFromSupabase(
  teacherId: string,
  options?: number | SummarySyncOptions
): Promise<SummarySyncResult> {
  if (!teacherId || !hasSupabaseConfig) {
    return {
      syncedCount: 0,
      syncedAt: null,
      source: "local",
    };
  }

  const normalizedOptions =
    typeof options === "number" ? { limit: options } : options ?? { limit: 24 };

  const remoteSummaries = await fetchRemoteSummaries(teacherId, normalizedOptions);
  for (const summary of remoteSummaries) {
    await persistLocalSummary(
      {
        ...summary,
        synced: true,
      },
      true
    );
  }

  return {
    syncedCount: remoteSummaries.length,
    syncedAt: new Date().toISOString(),
    source: "supabase",
  };
}

export async function saveSessionSummary(
  summary: SessionSummaryPayload,
  options: SummaryMutationOptions = {}
) {
  const nextSummary: SessionSummaryPayload = {
    ...summary,
    updatedAt: new Date().toISOString(),
  };

  return saveSessionSummaryInternal(nextSummary, options);
}

export async function updateSessionSummaryVoiceReflection(args: {
  sessionId: string;
  voiceReflectionUri?: string;
  voiceReflectionTranscript?: string;
  attemptRemoteSync?: boolean;
  queueOnFailure?: boolean;
}) {
  const existing = await getSessionSummary(args.sessionId);
  if (!existing) {
    throw new Error("Session summary not found.");
  }

  return saveSessionSummary(
    {
      ...existing,
      voiceReflectionUri: args.voiceReflectionUri ?? existing.voiceReflectionUri,
      voiceReflectionTranscript:
        args.voiceReflectionTranscript ?? existing.voiceReflectionTranscript,
    },
    {
      attemptRemoteSync: args.attemptRemoteSync,
      queueOnFailure: args.queueOnFailure,
    }
  );
}

export async function generateSessionSummary(
  session: SessionMeta,
  options?: {
    teacherId?: string;
    preferAI?: boolean;
    attemptRemoteSync?: boolean;
    queueOnFailure?: boolean;
    forceRegenerate?: boolean;
    voiceReflectionUri?: string;
    voiceReflectionTranscript?: string;
  }
): Promise<SessionSummaryPayload> {
  const existing = await getSessionSummary(session.id);
  if (existing && !options?.forceRegenerate) {
    if (
      options?.voiceReflectionUri ||
      typeof options?.voiceReflectionTranscript === "string"
    ) {
      return saveSessionSummary(
        {
          ...existing,
          voiceReflectionUri:
            options.voiceReflectionUri ?? existing.voiceReflectionUri,
          voiceReflectionTranscript:
            options.voiceReflectionTranscript ??
            existing.voiceReflectionTranscript,
        },
        {
          attemptRemoteSync: options.attemptRemoteSync,
          queueOnFailure: options.queueOnFailure,
        }
      );
    }

    return existing;
  }

  const [snapshots, storedMarkers, storedInterventions, storedClusters] =
    await Promise.all([
      listCachedPulseSnapshots(session.id, 360),
      listLessonMarkers(session.id),
      listInterventions(session.id),
      listCachedClusters(session.id),
    ]);

  const clusters =
    storedClusters.length > 0
      ? storedClusters
      : await refreshQuestionClusters({
          sessionId: session.id,
          session,
          lessonMarkers: storedMarkers,
        });

  const sessionStart = session.startedAt ?? snapshots[0]?.timestamp ?? session.createdAt;
  const sessionEnd =
    session.endedAt ?? snapshots[snapshots.length - 1]?.timestamp ?? new Date().toISOString();
  const sessionEndMs = new Date(sessionEnd).getTime();
  const settledInterventions = storedInterventions.map((intervention) =>
    settleIntervention(
      intervention,
      buildHydratedTrend(snapshots, storedInterventions),
      sessionEndMs
    )
  );
  const comprehensionTimeline = buildHydratedTrend(snapshots, settledInterventions);
  const peakConfusionMoments = derivePeakConfusionMoments(
    comprehensionTimeline,
    storedMarkers
  );
  const peakConfusionIndex = comprehensionTimeline.reduce(
    (max, point) => Math.max(max, point.confusionIndex),
    0
  );
  const endingConfusionIndex =
    comprehensionTimeline[comprehensionTimeline.length - 1]?.confusionIndex ?? 0;
  const peakLostPercent = comprehensionTimeline.reduce(
    (max, point) => Math.max(max, point.lostPercent),
    0
  );
  const endingLostPercent =
    comprehensionTimeline[comprehensionTimeline.length - 1]?.lostPercent ?? 0;
  const topClusters = [...clusters]
    .sort(
      (left, right) =>
        right.affectedCount - left.affectedCount ||
        right.updatedAt.localeCompare(left.updatedAt)
    )
    .slice(0, 4);
  const topReasonChips = aggregateReasonChips(clusters).slice(0, 5);
  const interventionStats = aggregateInterventionStats(settledInterventions);
  const dominantPollInsight = await computeDominantPollInsight(session.id);
  const duration = Math.max(
    1,
    Math.round(
      (new Date(sessionEnd).getTime() - new Date(sessionStart).getTime()) / 60_000
    )
  );
  const totalParticipants =
    Math.max(
      session.participantCount,
      (snapshots[snapshots.length - 1]?.totalActive ?? 0) +
        (snapshots[snapshots.length - 1]?.disconnectedCount ?? 0)
    ) || session.participantCount;
  const overallRecoveryScore = computeOverallRecoveryScore(
    peakConfusionIndex,
    endingConfusionIndex
  );
  const summaryBase: SessionSummaryPayload = {
    id: buildSummaryId(session.id),
    sessionId: session.id,
    teacherId: options?.teacherId ?? session.teacherId,
    subject: session.subject,
    topic: session.topic,
    gradeClass: session.gradeClass,
    duration,
    totalParticipants,
    comprehensionTimeline,
    peakConfusionMoments,
    topClusters,
    topReasonChips,
    lessonMarkers: storedMarkers,
    interventions: settledInterventions,
    interventionStats,
    dominantPollInsight,
    peakConfusionIndex: Math.round(peakConfusionIndex * 10) / 10,
    endingConfusionIndex: Math.round(endingConfusionIndex * 10) / 10,
    peakLostPercent: Math.round(peakLostPercent * 10) / 10,
    endingLostPercent: Math.round(endingLostPercent * 10) / 10,
    overallRecoveryScore,
    voiceReflectionUri: options?.voiceReflectionUri,
    voiceReflectionTranscript: options?.voiceReflectionTranscript,
    summarySource: "fallback",
    createdAt: sessionEnd,
    updatedAt: new Date().toISOString(),
  };

  let aiSummary: AISessionSummary = {
    narrative: `Confusion peaked at ${summaryBase.peakConfusionIndex.toFixed(1)} and closed at ${summaryBase.endingConfusionIndex.toFixed(1)}. Recovery finished at ${summaryBase.overallRecoveryScore} out of 100.`,
    suggestedOpeningActivity:
      "Open the next class with a short recap of the toughest step, then check confidence before moving ahead.",
    source: "fallback",
  };

  if (options?.preferAI !== false) {
    aiSummary = await aiProvider.generateSessionSummary(buildSummaryAIInput(summaryBase));
  }

  const completedSummary: SessionSummaryPayload = {
    ...summaryBase,
    aiNarrativeSummary: aiSummary.narrative,
    suggestedNextActivity: aiSummary.suggestedOpeningActivity,
    summarySource: aiSummary.source,
  };

  return saveSessionSummaryInternal(completedSummary, {
    attemptRemoteSync: options?.attemptRemoteSync,
    queueOnFailure: options?.queueOnFailure,
  });
}
