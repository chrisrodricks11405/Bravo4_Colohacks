import { getDatabase } from "../db";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import type {
  AnonymousQuestionPayload,
  PollResponsePayload,
  PulseAggregateSnapshot,
  QuickPollDraftInput,
  QuickPollPayload,
  SessionMeta,
} from "../types";
import { aiProvider } from "./ai";
import {
  computeConfusionIndex,
  createIntervention,
  createLessonMarker,
  listCachedClusters,
  persistClusters,
  persistPulseSnapshot,
  recordLocalQuestion,
} from "./liveSession";
import { createPollDraft, persistPollResponses, pushPoll } from "./polls";
import { updateSession } from "./session";
import {
  broadcastAnnouncement,
  broadcastTeacherPrompt,
  type StudentAnnouncementBroadcast,
  type TeacherPromptBroadcast,
} from "./studentLiveBroadcast";
import { createSessionAnnouncement } from "./studentEngagement";
import { generateSessionSummary } from "./summaries";

const DEMO_DIRECTIVE_PREFIX = "[[classpulse_demo?";
const DEMO_DIRECTIVE_SUFFIX = "]]";
const DEFAULT_DEMO_PARTICIPANTS = 0;
const DEFAULT_DEMO_DURATION_MINUTES = 10;

const participantsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_PARTICIPANTS_TABLE ?? "session_participants";
const pulseEventsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_PULSES_TABLE ?? "session_pulses";
const clustersTable =
  process.env.EXPO_PUBLIC_SUPABASE_MISCONCEPTION_CLUSTERS_TABLE ??
  "misconception_clusters";
const questionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_SESSION_QUESTIONS_TABLE ?? "session_questions";
const reactionsTable =
  process.env.EXPO_PUBLIC_SUPABASE_STUDENT_REACTIONS_TABLE ?? "student_reactions";
const heartbeatsTable =
  process.env.EXPO_PUBLIC_SUPABASE_STUDENT_HEARTBEATS_TABLE ?? "student_heartbeats";
const pollResponsesTable =
  process.env.EXPO_PUBLIC_SUPABASE_POLL_RESPONSES_TABLE ?? "poll_responses";

const UPSERT_LOCAL_PULSE_EVENT_SQL = `
  INSERT INTO local_pulse_events (
    id,
    session_id,
    anonymous_id,
    pulse,
    timestamp,
    source,
    reason,
    synced,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    anonymous_id = excluded.anonymous_id,
    pulse = excluded.pulse,
    timestamp = excluded.timestamp,
    source = excluded.source,
    reason = excluded.reason,
    synced = excluded.synced,
    synced_at = excluded.synced_at;
`;

type DemoMetadata = {
  youtubeUrl: string;
  participantCount: number;
  durationMinutes: number;
};

type DemoMarkerTemplate = {
  key: string;
  minute: number;
  label: string;
  type: "new_concept" | "example" | "practice" | "review" | "question_time";
};

type DemoQuestionTemplate = {
  key: string;
  anonymousId: string;
  minute: number;
  markerKey: string;
  text: string;
  language?: string;
  reason?: string;
};

type DemoSnapshotTemplate = {
  minute: number;
  gotItCount: number;
  sortOfCount: number;
  lostCount: number;
  disconnectedCount: number;
};

type DemoInterventionTemplate = {
  clusterReason: "step_unclear" | "language_friction" | "example_needed";
  lessonMarkerKey: string;
  minute: number;
  type: "example" | "bilingual_explanation" | "poll";
  confusionBefore: number;
  confusionAfter: number;
  recoveryWindowSeconds: number;
  notes: string;
};

type DemoBlueprint = {
  metadata: DemoMetadata;
  markers: DemoMarkerTemplate[];
  questions: DemoQuestionTemplate[];
  snapshots: DemoSnapshotTemplate[];
  interventions: DemoInterventionTemplate[];
  pollDraft: QuickPollDraftInput;
  voiceReflectionTranscript: string;
  announcementDrafts: Array<{ title: string; body: string }>;
};

type ParticipantPresenceRow = {
  anonymous_id: string | null;
};

function buildDirective(metadata: DemoMetadata) {
  const params = new URLSearchParams({
    youtube: metadata.youtubeUrl,
    participants: String(metadata.participantCount),
    duration: String(metadata.durationMinutes),
  });

  return `${DEMO_DIRECTIVE_PREFIX}${params.toString()}${DEMO_DIRECTIVE_SUFFIX}`;
}

function getDirectiveMatch(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trimStart();
  if (!trimmed.startsWith(DEMO_DIRECTIVE_PREFIX)) {
    return null;
  }

  const endIndex = trimmed.indexOf(DEMO_DIRECTIVE_SUFFIX);
  if (endIndex < 0) {
    return null;
  }

  return trimmed.slice(0, endIndex + DEMO_DIRECTIVE_SUFFIX.length);
}

function extractDirectiveParams(value?: string | null) {
  const directive = getDirectiveMatch(value);
  if (!directive) {
    return null;
  }

  const queryString = directive
    .slice(DEMO_DIRECTIVE_PREFIX.length, -DEMO_DIRECTIVE_SUFFIX.length)
    .trim();

  return new URLSearchParams(queryString);
}

function normalizeInteger(
  value: string | null,
  fallback: number,
  minimum = 0
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return Math.round(parsed);
}

function formatParticipantId(index: number) {
  return `demo_student_${String(index + 1).padStart(2, "0")}`;
}

function uniqueParticipantIds(count: number) {
  return Array.from({ length: count }, (_, index) => formatParticipantId(index));
}

function pickParticipantId(participantIds: string[], index: number) {
  if (participantIds.length === 0) {
    return formatParticipantId(index);
  }

  return participantIds[index % participantIds.length];
}

function toTimestamp(startMs: number, minuteOffset: number) {
  return new Date(startMs + minuteOffset * 60_000).toISOString();
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function pickBridgeLanguage(language: string) {
  const normalized = language.trim().toLowerCase();

  if (normalized.includes("hindi")) {
    return "English";
  }

  if (normalized.includes("english")) {
    return "Hindi";
  }

  return "English";
}

function buildTeacherPromptBody(clusterTitle: string) {
  return `Your teacher is revisiting ${clusterTitle.toLowerCase()}. Listen for the next explanation.`;
}

function toStudentAnnouncementPayload(args: {
  id: string;
  title?: string;
  body: string;
  issuedAt: string;
}): StudentAnnouncementBroadcast {
  return {
    announcementId: args.id,
    title: args.title,
    body: args.body,
    type: "text",
    issuedAt: args.issuedAt,
  };
}

function toTeacherPromptPayload(args: {
  id: string;
  title: string;
  locale: string;
  issuedAt: string;
}): TeacherPromptBroadcast {
  return {
    promptId: args.id,
    title: "Teacher note",
    body: buildTeacherPromptBody(args.title),
    issuedAt: args.issuedAt,
    locale: args.locale,
  };
}

function buildSnapshotTemplate(
  minute: number,
  participantCount: number,
  profile: {
    gotRatio: number;
    sortRatio: number;
    lostRatio: number;
  }
): DemoSnapshotTemplate {
  const totalActive = Math.max(participantCount, 1);
  let gotItCount = Math.round(totalActive * profile.gotRatio);
  let sortOfCount = Math.round(totalActive * profile.sortRatio);
  let lostCount = Math.round(totalActive * profile.lostRatio);
  const totalCount = gotItCount + sortOfCount + lostCount;

  if (totalCount < totalActive) {
    gotItCount += totalActive - totalCount;
  } else if (totalCount > totalActive) {
    const overflow = totalCount - totalActive;
    const sortTrim = Math.min(sortOfCount, overflow);
    sortOfCount -= sortTrim;
    lostCount = Math.max(totalActive - gotItCount - sortOfCount, 0);
  }

  return {
    minute,
    gotItCount,
    sortOfCount,
    lostCount,
    disconnectedCount: 0,
  };
}

function buildBlueprint(
  session: SessionMeta,
  metadata: DemoMetadata,
  participantIds: string[]
): DemoBlueprint {
  const bridgeLanguage = pickBridgeLanguage(session.language);
  const topicHandle = sentenceCase(session.topic);
  const simplifiedTopic = session.topic.trim().toLowerCase() || "the topic";
  const sessionLanguage = sentenceCase(session.language);
  const participantCount = Math.max(participantIds.length, 1);

  return {
    metadata: {
      ...metadata,
      participantCount,
    },
    markers: [
      {
        key: "intro",
        minute: 1,
        type: "new_concept",
        label: `Lecture intro · ${topicHandle}`,
      },
      {
        key: "worked_example",
        minute: 3,
        type: "example",
        label: `Worked example from the lecture`,
      },
      {
        key: "checkpoint",
        minute: 5,
        type: "practice",
        label: "Checkpoint poll",
      },
      {
        key: "bilingual_recap",
        minute: 7,
        type: "review",
        label: `Bilingual bridge (${bridgeLanguage})`,
      },
      {
        key: "voice_recap",
        minute: 9,
        type: "question_time",
        label: "Voice recap of missed topics",
      },
    ],
    questions: [
      {
        key: "q_step_1",
        anonymousId: pickParticipantId(participantIds, 0),
        minute: 4,
        markerKey: "worked_example",
        text: `Which step comes after the middle part of ${simplifiedTopic}?`,
        reason: "step_unclear",
      },
      {
        key: "q_step_2",
        anonymousId: pickParticipantId(participantIds, 1),
        minute: 4,
        markerKey: "worked_example",
        text: `Can you show the next step in ${simplifiedTopic} once more?`,
        reason: "step_unclear",
      },
      {
        key: "q_example_1",
        anonymousId: pickParticipantId(participantIds, 2),
        minute: 5,
        markerKey: "checkpoint",
        text: `Can we do one more example for ${simplifiedTopic} before moving on?`,
        reason: "example_needed",
      },
      {
        key: "q_language_1",
        anonymousId: pickParticipantId(participantIds, 3),
        minute: 7,
        markerKey: "bilingual_recap",
        text: `Can you translate the key words in ${simplifiedTopic}?`,
        language: bridgeLanguage,
        reason: "language_friction",
      },
      {
        key: "q_language_2",
        anonymousId: pickParticipantId(participantIds, 4),
        minute: 7,
        markerKey: "bilingual_recap",
        text: `The wording in ${simplifiedTopic} is confusing. Can you explain it in ${bridgeLanguage}?`,
        language: bridgeLanguage,
        reason: "language_friction",
      },
      {
        key: "q_fast_1",
        anonymousId: pickParticipantId(participantIds, 5),
        minute: 8,
        markerKey: "voice_recap",
        text: `Can you repeat the explanation more slowly? The middle part of ${simplifiedTopic} felt too fast.`,
        reason: "too_fast",
      },
    ],
    snapshots: [
      buildSnapshotTemplate(1, participantCount, {
        gotRatio: 0.75,
        sortRatio: 0.25,
        lostRatio: 0,
      }),
      buildSnapshotTemplate(3, participantCount, {
        gotRatio: 0.5,
        sortRatio: 0.35,
        lostRatio: 0.15,
      }),
      buildSnapshotTemplate(5, participantCount, {
        gotRatio: 0.3,
        sortRatio: 0.45,
        lostRatio: 0.25,
      }),
      buildSnapshotTemplate(7, participantCount, {
        gotRatio: 0.55,
        sortRatio: 0.3,
        lostRatio: 0.15,
      }),
      buildSnapshotTemplate(8, participantCount, {
        gotRatio: 0.65,
        sortRatio: 0.25,
        lostRatio: 0.1,
      }),
      buildSnapshotTemplate(10, participantCount, {
        gotRatio: 0.8,
        sortRatio: 0.2,
        lostRatio: 0,
      }),
    ],
    interventions: [
      {
        clusterReason: "step_unclear",
        lessonMarkerKey: "worked_example",
        minute: 5,
        type: "example",
        confusionBefore: 46,
        confusionAfter: 29,
        recoveryWindowSeconds: 90,
        notes: `Replayed the lecture's worked example line by line for ${topicHandle}.`,
      },
      {
        clusterReason: "language_friction",
        lessonMarkerKey: "bilingual_recap",
        minute: 7,
        type: "bilingual_explanation",
        confusionBefore: 31,
        confusionAfter: 18,
        recoveryWindowSeconds: 75,
        notes: `Bridged the lecture in ${sessionLanguage} and ${bridgeLanguage} to close language friction.`,
      },
      {
        clusterReason: "example_needed",
        lessonMarkerKey: "checkpoint",
        minute: 8,
        type: "poll",
        confusionBefore: 24,
        confusionAfter: 14,
        recoveryWindowSeconds: 60,
        notes: "Ran a quick poll before the final recap and voice summary.",
      },
    ],
    pollDraft: {
      question: `Which support move would help you most with ${topicHandle}?`,
      options: [
        "I can move ahead on my own now.",
        "One more example would help.",
        `A short ${bridgeLanguage} bridge would help.`,
        "I want a 60-second recap of the missed part.",
      ],
      correctOptionIndex: 0,
      source: "ai_generated",
      rationale:
        "This demo poll separates students who are ready to proceed from learners who need one more example, a bilingual bridge, or a short missed-topic recap.",
    },
    voiceReflectionTranscript: `The YouTube-backed lecture on ${topicHandle} landed well in the opening, but the middle transition created step confusion for a pocket of students. A bilingual bridge in ${bridgeLanguage} and one extra example restored confidence. For the next class, open with a missed-topic voice recap and then run a short confidence poll before independent practice.`,
    announcementDrafts: [
      {
        title: "Missed-topic recap",
        body: `If you missed a step in ${simplifiedTopic}, the app can replay the recap in ${bridgeLanguage} before practice.`,
      },
      {
        title: "Checkpoint ready",
        body: "Quick poll is live. Vote once so the teacher can see whether to reteach, switch language, or move ahead.",
      },
    ],
  };
}

function createSnapshot(
  sessionId: string,
  timestamp: string,
  template: DemoSnapshotTemplate
): PulseAggregateSnapshot {
  const totalActive =
    template.gotItCount + template.sortOfCount + template.lostCount;

  return {
    sessionId,
    timestamp,
    gotItCount: template.gotItCount,
    sortOfCount: template.sortOfCount,
    lostCount: template.lostCount,
    totalActive,
    disconnectedCount: template.disconnectedCount,
    confusionIndex: computeConfusionIndex({
      gotItCount: template.gotItCount,
      sortOfCount: template.sortOfCount,
      lostCount: template.lostCount,
      totalActive,
      disconnectedCount: template.disconnectedCount,
    }),
  };
}

function enrichClusters(
  session: SessionMeta,
  clusters: Awaited<ReturnType<typeof listCachedClusters>>
) {
  const bridgeLanguage = pickBridgeLanguage(session.language);

  return clusters.map((cluster) => {
    if (cluster.reasonChip === "language_friction") {
      return {
        ...cluster,
        translation:
          cluster.translation ??
          `${bridgeLanguage} bridge: restate ${session.topic} in simpler classroom language before the next example.`,
        suggestedInterventions: [
          `Bridge the idea in ${session.language} and ${bridgeLanguage}`,
          "Replay the key vocabulary with simpler phrasing",
          "Ask one student to paraphrase the idea back",
        ],
      };
    }

    if (cluster.reasonChip === "step_unclear") {
      return {
        ...cluster,
        suggestedInterventions: [
          "Replay the worked example line by line",
          "Pause and ask what changes next",
          "Confirm the transition with a fast check-in",
        ],
      };
    }

    if (cluster.reasonChip === "example_needed") {
      return {
        ...cluster,
        suggestedInterventions: [
          "Solve one more example from the lecture",
          "Use the quick poll to separate confidence levels",
          "Give a 60-second recap before moving on",
        ],
      };
    }

    return cluster;
  });
}

function buildLocalPollResponses(args: {
  poll: QuickPollPayload;
  participantIds: string[];
  startMs: number;
}): PollResponsePayload[] {
  const { poll, participantIds, startMs } = args;
  return participantIds.map((anonymousId, index) => ({
    id: `${poll.id}_response_${String(index + 1).padStart(2, "0")}`,
    pollId: poll.id,
    sessionId: poll.sessionId,
    anonymousId,
    optionIndex: [1, 2, 3, 0][index % 4],
    submittedAt: new Date(startMs + 8 * 60_000 + index * 12_000).toISOString(),
  }));
}

async function seedLocalPulseEvents(args: {
  sessionId: string;
  session: SessionMeta;
  finalSnapshot: PulseAggregateSnapshot;
  participantIds: string[];
}) {
  const db = await getDatabase();
  const timestamp = args.finalSnapshot.timestamp;
  const activeParticipants = args.participantIds.slice(0, args.finalSnapshot.totalActive);
  const gotItIds = activeParticipants.slice(0, args.finalSnapshot.gotItCount);
  const sortOfIds = activeParticipants.slice(
    gotItIds.length,
    gotItIds.length + args.finalSnapshot.sortOfCount
  );
  const lostIds = activeParticipants.slice(
    gotItIds.length + sortOfIds.length,
    gotItIds.length + sortOfIds.length + args.finalSnapshot.lostCount
  );

  for (const anonymousId of gotItIds) {
    await db.runAsync(
      UPSERT_LOCAL_PULSE_EVENT_SQL,
      `${args.sessionId}:pulse:${anonymousId}`,
      args.sessionId,
      anonymousId,
      "got_it",
      timestamp,
      "demo_replay",
      null,
      0,
      null
    );
  }

  for (const [index, anonymousId] of sortOfIds.entries()) {
    const reasons = ["step_unclear", "language_friction", "example_needed", "too_fast"];
    await db.runAsync(
      UPSERT_LOCAL_PULSE_EVENT_SQL,
      `${args.sessionId}:pulse:${anonymousId}`,
      args.sessionId,
      anonymousId,
      "sort_of",
      timestamp,
      "demo_replay",
      reasons[index % reasons.length],
      0,
      null
    );
  }

  for (const [index, anonymousId] of lostIds.entries()) {
    const reasons = ["language_friction", "step_unclear", "too_fast"];
    await db.runAsync(
      UPSERT_LOCAL_PULSE_EVENT_SQL,
      `${args.sessionId}:pulse:${anonymousId}`,
      args.sessionId,
      anonymousId,
      "lost",
      timestamp,
      "demo_replay",
      reasons[index % reasons.length],
      0,
      null
    );
  }
}

async function listKnownParticipantIds(sessionId: string, fallbackCount: number) {
  if (!hasSupabaseConfig) {
    return uniqueParticipantIds(Math.max(fallbackCount, 1));
  }

  const { data, error } = await supabase
    .from(participantsTable)
    .select("anonymous_id")
    .eq("session_id", sessionId)
    .order("joined_at", { ascending: true });

  if (error) {
    throw error;
  }

  const remoteIds = ((data as ParticipantPresenceRow[] | null) ?? [])
    .map((row) => row.anonymous_id?.trim() ?? "")
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

  if (remoteIds.length > 0) {
    return remoteIds;
  }

  return uniqueParticipantIds(Math.max(fallbackCount, 1));
}

async function upsertRemotePulseEvents(args: {
  sessionId: string;
  finalSnapshot: PulseAggregateSnapshot;
  participantIds: string[];
}) {
  if (!hasSupabaseConfig) {
    return;
  }

  const activeParticipants = args.participantIds.slice(0, args.finalSnapshot.totalActive);
  const gotItIds = activeParticipants.slice(0, args.finalSnapshot.gotItCount);
  const sortOfIds = activeParticipants.slice(
    gotItIds.length,
    gotItIds.length + args.finalSnapshot.sortOfCount
  );
  const lostIds = activeParticipants.slice(
    gotItIds.length + sortOfIds.length,
    gotItIds.length + sortOfIds.length + args.finalSnapshot.lostCount
  );

  const rows = [
    ...gotItIds.map((anonymousId) => ({
      id: `${args.sessionId}:pulse:${anonymousId}`,
      session_id: args.sessionId,
      anonymous_id: anonymousId,
      pulse: "got_it",
      timestamp: args.finalSnapshot.timestamp,
      source: "demo_replay",
      reason: null,
    })),
    ...sortOfIds.map((anonymousId, index) => ({
      id: `${args.sessionId}:pulse:${anonymousId}`,
      session_id: args.sessionId,
      anonymous_id: anonymousId,
      pulse: "sort_of",
      timestamp: args.finalSnapshot.timestamp,
      source: "demo_replay",
      reason: ["step_unclear", "language_friction", "example_needed", "too_fast"][
        index % 4
      ],
    })),
    ...lostIds.map((anonymousId, index) => ({
      id: `${args.sessionId}:pulse:${anonymousId}`,
      session_id: args.sessionId,
      anonymous_id: anonymousId,
      pulse: "lost",
      timestamp: args.finalSnapshot.timestamp,
      source: "demo_replay",
      reason: ["language_friction", "step_unclear", "too_fast"][index % 3],
    })),
  ];

  const { error } = await supabase.from(pulseEventsTable).upsert(rows, { onConflict: "id" });
  if (error) {
    throw error;
  }
}

async function upsertRemoteClusters(clusters: Awaited<ReturnType<typeof listCachedClusters>>) {
  if (!hasSupabaseConfig || clusters.length === 0) {
    return;
  }

  const rows = clusters.map((cluster) => ({
    id: cluster.id,
    session_id: cluster.sessionId,
    title: cluster.title,
    summary: cluster.summary,
    affected_count: cluster.affectedCount,
    representative_question: cluster.representativeQuestion,
    reason_chip: cluster.reasonChip,
    lesson_marker_id: cluster.lessonMarkerId ?? null,
    translation: cluster.translation ?? null,
    keyword_anchors: cluster.keywordAnchors ?? [],
    latest_question_at: cluster.latestQuestionAt ?? cluster.updatedAt,
    source: cluster.source ?? "fallback",
    status: cluster.status,
    suggested_interventions: cluster.suggestedInterventions,
    created_at: cluster.createdAt,
    updated_at: cluster.updatedAt,
  }));

  const { error } = await supabase.from(clustersTable).upsert(rows, { onConflict: "id" });
  if (error) {
    throw error;
  }
}

async function upsertRemoteRecentQuestions(questions: AnonymousQuestionPayload[]) {
  if (!hasSupabaseConfig || questions.length === 0) {
    return;
  }

  const now = Date.now();
  const rows = questions.map((question, index) => ({
    id: question.id,
    session_id: question.sessionId,
    anonymous_id: question.anonymousId,
    text: question.text,
    language: question.language ?? null,
    reason: question.reason ?? null,
    lesson_marker_id: question.lessonMarkerId ?? null,
    timestamp: new Date(now - (questions.length - index) * 9_000).toISOString(),
  }));

  const { error } = await supabase.from(questionsTable).upsert(rows, { onConflict: "id" });
  if (error) {
    throw error;
  }
}

async function upsertRemoteRecentEngagement(args: {
  sessionId: string;
  participantIds: string[];
  pollResponses: PollResponsePayload[];
}) {
  if (!hasSupabaseConfig) {
    return;
  }

  const now = Date.now();
  const reactionRows = args.participantIds.slice(0, 6).map((anonymousId, index) => ({
    id: `${args.sessionId}:reaction:${index + 1}`,
    session_id: args.sessionId,
    anonymous_id: anonymousId,
    emoji: ["thumbs_up", "lightbulb", "question", "clap"][index % 4],
    created_at: new Date(now - 55_000 + index * 6_000).toISOString(),
  }));

  const heartbeatRows = args.participantIds.slice(0, 16).map((anonymousId, index) => ({
    id: `${args.sessionId}:heartbeat:${index + 1}`,
    session_id: args.sessionId,
    anonymous_id: anonymousId,
    signal_state: index < 9 ? "got_it" : index < 14 ? "sort_of" : "lost",
    screen_time_ms: 38_000 + index * 2_200,
    sent_at: new Date(now - 85_000 + index * 3_500).toISOString(),
  }));

  const remotePollResponses = args.pollResponses.slice(0, 10).map((response, index) => ({
    id: response.id,
    poll_id: response.pollId,
    session_id: response.sessionId,
    anonymous_id: response.anonymousId,
    option_index: response.optionIndex,
    submitted_at: new Date(now - 70_000 + index * 4_000).toISOString(),
  }));

  const [reactionsResult, heartbeatsResult, pollResponsesResult] = await Promise.all([
    supabase.from(reactionsTable).upsert(reactionRows, { onConflict: "id" }),
    supabase.from(heartbeatsTable).upsert(heartbeatRows, { onConflict: "id" }),
    supabase.from(pollResponsesTable).upsert(remotePollResponses, { onConflict: "id" }),
  ]);

  if (reactionsResult.error) {
    throw reactionsResult.error;
  }

  if (heartbeatsResult.error) {
    throw heartbeatsResult.error;
  }

  if (pollResponsesResult.error) {
    throw pollResponsesResult.error;
  }
}

async function createRemoteAnnouncements(args: {
  sessionId: string;
  drafts: Array<{ title: string; body: string }>;
}) {
  if (!hasSupabaseConfig || args.drafts.length === 0) {
    return;
  }

  for (const draft of args.drafts) {
    const created = await createSessionAnnouncement({
      sessionId: args.sessionId,
      title: draft.title,
      body: draft.body,
    });

    if (created) {
      await broadcastAnnouncement(
        args.sessionId,
        toStudentAnnouncementPayload({
          id: created.id,
          title: created.title,
          body: created.body,
          issuedAt: created.issuedAt,
        })
      );
    }
  }
}

export function normalizeYouTubeUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const candidate = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (hostname === "youtu.be") {
      videoId = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    } else if (hostname.endsWith("youtube.com")) {
      if (parsed.pathname.startsWith("/watch")) {
        videoId = parsed.searchParams.get("v") ?? "";
      } else if (parsed.pathname.startsWith("/shorts/")) {
        videoId = parsed.pathname.split("/")[2] ?? "";
      } else if (parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/")[2] ?? "";
      }
    }

    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
      return null;
    }

    return `https://youtu.be/${videoId}`;
  } catch {
    return null;
  }
}

export function composeDemoLessonPlanSeed(args: {
  existingSeed?: string;
  youtubeUrl?: string;
  participantCount?: number;
  durationMinutes?: number;
}) {
  const normalizedUrl = normalizeYouTubeUrl(args.youtubeUrl);
  const baseSeed = stripDemoDirective(args.existingSeed)?.trim();

  if (!normalizedUrl) {
    return baseSeed || undefined;
  }

  const directive = buildDirective({
    youtubeUrl: normalizedUrl,
    participantCount: args.participantCount ?? DEFAULT_DEMO_PARTICIPANTS,
    durationMinutes: args.durationMinutes ?? DEFAULT_DEMO_DURATION_MINUTES,
  });

  return [directive, baseSeed].filter(Boolean).join("\n\n");
}

export function extractDemoMetadata(value?: string | null): DemoMetadata | null {
  const params = extractDirectiveParams(value);
  if (!params) {
    return null;
  }

  const youtubeUrl = normalizeYouTubeUrl(params.get("youtube"));
  if (!youtubeUrl) {
    return null;
  }

  return {
    youtubeUrl,
    participantCount: normalizeInteger(
      params.get("participants"),
      DEFAULT_DEMO_PARTICIPANTS,
      0
    ),
    durationMinutes: normalizeInteger(
      params.get("duration"),
      DEFAULT_DEMO_DURATION_MINUTES,
      1
    ),
  };
}

export function stripDemoDirective(value?: string | null) {
  const directive = getDirectiveMatch(value);
  if (!directive) {
    return value?.trim() || undefined;
  }

  const stripped = value?.replace(directive, "").trim();
  return stripped || undefined;
}

export async function prepareYouTubeDemoLobby(
  session: SessionMeta,
  options: {
    attemptRemoteSync?: boolean;
    queueOnFailure?: boolean;
  } = {}
) {
  void options;
  return session;
}

export async function startYouTubeDemoClassroom(
  session: SessionMeta,
  options: {
    attemptRemoteSync?: boolean;
    queueOnFailure?: boolean;
    preferAI?: boolean;
  } = {}
) {
  const metadata = extractDemoMetadata(session.lessonPlanSeed);
  if (!metadata) {
    return updateSession(
      session,
      {
        status: "active",
        startedAt: session.startedAt ?? new Date().toISOString(),
      },
      options
    );
  }

  if (session.participantCount < 1) {
    throw new Error(
      "No students have joined yet. Join from the Android app first, then begin the demo."
    );
  }

  const startedAt = new Date(
    Date.now() - metadata.durationMinutes * 60_000
  ).toISOString();
  const liveSession = await updateSession(
    session,
    {
      status: "active",
      startedAt,
      participantCount: session.participantCount,
    },
    {
      attemptRemoteSync: options.attemptRemoteSync,
      queueOnFailure: options.queueOnFailure,
    }
  );

  const participantIds = await listKnownParticipantIds(
    liveSession.id,
    liveSession.participantCount
  );
  const blueprint = buildBlueprint(liveSession, metadata, participantIds);
  const startMs = new Date(liveSession.startedAt ?? startedAt).getTime();

  const markerMap = new Map<string, Awaited<ReturnType<typeof createLessonMarker>>>();
  for (const marker of blueprint.markers) {
    const savedMarker = await createLessonMarker({
      sessionId: liveSession.id,
      type: marker.type,
      label: marker.label,
      timestamp: toTimestamp(startMs, marker.minute),
      attemptRemoteSync: options.attemptRemoteSync,
      queueOnFailure: options.queueOnFailure,
    });
    markerMap.set(marker.key, savedMarker);
  }

  const localQuestions: AnonymousQuestionPayload[] = [];
  let latestClusters: Awaited<ReturnType<typeof listCachedClusters>> = [];

  for (const question of blueprint.questions) {
    const savedQuestion: AnonymousQuestionPayload = {
      id: `${liveSession.id}:${question.key}`,
      sessionId: liveSession.id,
      anonymousId: question.anonymousId,
      text: question.text,
      language: question.language,
      reason: question.reason,
      lessonMarkerId: markerMap.get(question.markerKey)?.id,
      timestamp: toTimestamp(startMs, question.minute),
    };
    latestClusters = await recordLocalQuestion(savedQuestion, { session: liveSession });
    localQuestions.push(savedQuestion);
  }

  const enrichedClusters = enrichClusters(liveSession, latestClusters);
  await persistClusters(enrichedClusters);

  const snapshots = blueprint.snapshots.map((snapshot) =>
    createSnapshot(
      liveSession.id,
      toTimestamp(startMs, snapshot.minute),
      snapshot
    )
  );

  for (const snapshot of snapshots) {
    await persistPulseSnapshot(snapshot);
  }

  const finalSnapshot = snapshots[snapshots.length - 1];
  if (finalSnapshot) {
    await seedLocalPulseEvents({
      sessionId: liveSession.id,
      session: liveSession,
      finalSnapshot,
      participantIds,
    });
  }

  const dominantCluster =
    [...enrichedClusters].sort(
      (left, right) =>
        right.affectedCount - left.affectedCount ||
        right.updatedAt.localeCompare(left.updatedAt)
    )[0] ?? null;
  const languageCluster =
    enrichedClusters.find((cluster) => cluster.reasonChip === "language_friction") ?? null;
  const exampleCluster =
    enrichedClusters.find((cluster) => cluster.reasonChip === "example_needed") ?? null;

  for (const intervention of blueprint.interventions) {
    const targetCluster =
      intervention.clusterReason === "language_friction"
        ? languageCluster
        : intervention.clusterReason === "example_needed"
          ? exampleCluster
          : dominantCluster;

    await createIntervention({
      sessionId: liveSession.id,
      type: intervention.type,
      clusterId: targetCluster?.id,
      lessonMarkerId: markerMap.get(intervention.lessonMarkerKey)?.id,
      timestamp: toTimestamp(startMs, intervention.minute),
      confusionBefore: intervention.confusionBefore,
      confusionAfter: intervention.confusionAfter,
      recoveryScore: intervention.confusionBefore - intervention.confusionAfter,
      recoveryWindowSeconds: intervention.recoveryWindowSeconds,
      notes: intervention.notes,
      attemptRemoteSync: options.attemptRemoteSync,
      queueOnFailure: options.queueOnFailure,
    });
  }

  const pollDraft = await createPollDraft(
    liveSession.id,
    {
      ...blueprint.pollDraft,
      clusterId: dominantCluster?.id,
      clusterTitle: dominantCluster?.title,
    },
    {
      attemptRemoteSync: options.attemptRemoteSync,
      queueOnFailure: options.queueOnFailure,
    }
  );

  const activePoll = await pushPoll(pollDraft.id, {
    attemptRemoteSync: options.attemptRemoteSync,
    queueOnFailure: options.queueOnFailure,
  });

  const localPollResponses = buildLocalPollResponses({
    poll: activePoll,
    participantIds,
    startMs,
  });
  await persistPollResponses(localPollResponses);

  const reflectionPlan = await aiProvider.structureVoiceReflection(
    blueprint.voiceReflectionTranscript,
    {
      subject: liveSession.subject,
      topic: liveSession.topic,
      gradeClass: liveSession.gradeClass,
      suggestedNextActivity:
        "Open the next class with a missed-topic voice recap and a short bilingual check-in.",
    }
  );

  await generateSessionSummary(liveSession, {
    teacherId: liveSession.teacherId,
    preferAI: options.preferAI,
    attemptRemoteSync: options.attemptRemoteSync,
    queueOnFailure: options.queueOnFailure,
    forceRegenerate: true,
    voiceReflectionTranscript: blueprint.voiceReflectionTranscript,
    voiceReflectionSummary: reflectionPlan.summary,
    voiceReflectionActions: reflectionPlan.actions,
    voiceReflectionActionSource: reflectionPlan.source,
  });

  if (options.attemptRemoteSync && hasSupabaseConfig && liveSession.mode !== "offline") {
    try {
      const remoteOps: Promise<unknown>[] = [];

      if (finalSnapshot) {
        remoteOps.push(
          upsertRemotePulseEvents({
            sessionId: liveSession.id,
            finalSnapshot,
            participantIds,
          })
        );
      }

      remoteOps.push(upsertRemoteClusters(enrichedClusters));
      remoteOps.push(upsertRemoteRecentQuestions(localQuestions));
      remoteOps.push(
        upsertRemoteRecentEngagement({
          sessionId: liveSession.id,
          participantIds,
          pollResponses: localPollResponses,
        })
      );

      await Promise.all(remoteOps);

      if (dominantCluster) {
        await broadcastTeacherPrompt(
          liveSession.id,
          toTeacherPromptPayload({
            id: dominantCluster.id,
            title: dominantCluster.title,
            locale: liveSession.language,
            issuedAt: dominantCluster.updatedAt,
          })
        );
      }

      await createRemoteAnnouncements({
        sessionId: liveSession.id,
        drafts: blueprint.announcementDrafts,
      });
    } catch {
      // Local demo data is already prepared; remote enrichment is best-effort.
    }
  }

  return liveSession;
}
