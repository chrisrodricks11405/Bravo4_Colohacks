import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type ReasonChip =
  | "step_unclear"
  | "language_friction"
  | "missing_prerequisite"
  | "too_fast"
  | "notation_confusion"
  | "example_needed"
  | "other";

type ClusterStatus = "active" | "acknowledged" | "resolved" | "dismissed";

interface QuestionRow {
  id: string;
  session_id: string;
  anonymous_id: string;
  text: string;
  language: string | null;
  lesson_marker_id: string | null;
  embedding?: string | null;
  timestamp: string;
}

interface LessonMarkerInput {
  id: string;
  timestamp: string;
}

interface ClusterRow {
  id: string;
  session_id: string;
  title: string;
  summary: string;
  affected_count: number;
  representative_question: string;
  reason_chip: ReasonChip;
  lesson_marker_id: string | null;
  translation: string | null;
  keyword_anchors: string[];
  latest_question_at: string | null;
  source: "ai" | "fallback";
  status: ClusterStatus;
  suggested_interventions: string[];
  created_at: string;
  updated_at: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const QUESTION_TABLE = Deno.env.get("SUPABASE_SESSION_QUESTIONS_TABLE") ?? "session_questions";
const CLUSTER_TABLE =
  Deno.env.get("SUPABASE_MISCONCEPTION_CLUSTERS_TABLE") ?? "misconception_clusters";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STOP_WORDS = new Set([
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
  "of",
  "on",
  "or",
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
  "again",
  "please",
  "question",
  "doubt",
  "explain",
]);

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)
    );
}

function getKeywordAnchors(text: string, limit = 4) {
  const counts = new Map<string, number>();

  tokenize(text).forEach((token) => {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function mergeKeywordAnchors(existing: string[], next: string[], limit = 6) {
  return [...new Set([...existing, ...next])].slice(0, limit);
}

function jaccard(left: Set<string>, right: Set<string>) {
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

function inferReasonChip(question: QuestionRow, sessionLanguage?: string): ReasonChip {
  const normalizedText = question.text.toLowerCase();
  const questionLanguage = question.language?.trim().toLowerCase();
  const classLanguage = sessionLanguage?.trim().toLowerCase();

  if (questionLanguage && classLanguage && questionLanguage !== classLanguage) {
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
  lessonMarkerId: string | null | undefined,
  keywordAnchors: string[]
) {
  const markerPart = lessonMarkerId ? slugify(lessonMarkerId) : "no_marker";
  const keywordPart = keywordAnchors.length > 0 ? keywordAnchors.join("_") : "general";
  return slugify(`cluster_${sessionId}_${reasonChip}_${markerPart}_${keywordPart}`);
}

function buildClusterTitle(reasonChip: ReasonChip, keywordAnchors: string[]) {
  const topicHandle = keywordAnchors.slice(0, 2).join(" ");

  switch (reasonChip) {
    case "step_unclear":
      return topicHandle ? `Steps unclear around ${topicHandle}` : "Steps unclear";
    case "language_friction":
      return topicHandle ? `Language friction on ${topicHandle}` : "Language friction";
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

function buildReasonSummary(reasonChip: ReasonChip) {
  switch (reasonChip) {
    case "step_unclear":
      return "students are losing the sequence of steps";
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

function buildClusterSummary(
  reasonChip: ReasonChip,
  keywordAnchors: string[],
  affectedCount: number
) {
  const topicHandle = keywordAnchors.slice(0, 3).join(", ");
  const countLabel = affectedCount === 1 ? "1 student" : `${affectedCount} students`;

  if (!topicHandle) {
    return `${countLabel} are surfacing the same concern; ${buildReasonSummary(reasonChip)}.`;
  }

  return `${countLabel} are asking about ${topicHandle}; ${buildReasonSummary(reasonChip)}.`;
}

function buildSuggestedInterventions(reasonChip: ReasonChip, sessionLanguage?: string) {
  const languageHint = sessionLanguage
    ? `Rephrase once in ${sessionLanguage}`
    : "Rephrase once";

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
        "Connect the new step to the earlier concept",
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
        "Inspect the representative question first",
        "Acknowledge the cluster so students know you saw it",
        "Generate a quick poll if confusion keeps climbing",
      ];
  }
}

function resolveLessonMarkerId(question: QuestionRow, lessonMarkers: LessonMarkerInput[]) {
  if (question.lesson_marker_id) {
    return question.lesson_marker_id;
  }

  const questionTime = new Date(question.timestamp).getTime();
  if (!Number.isFinite(questionTime)) {
    return null;
  }

  const marker = [...lessonMarkers]
    .reverse()
    .find((candidate) => new Date(candidate.timestamp).getTime() <= questionTime);

  return marker?.id ?? null;
}

function pickRepresentativeQuestion(questions: QuestionRow[]) {
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

function pickDominantReasonChip(
  questions: QuestionRow[],
  sessionLanguage?: string
): ReasonChip {
  const counts = new Map<ReasonChip, number>();

  questions.forEach((question) => {
    const reasonChip = inferReasonChip(question, sessionLanguage);
    counts.set(reasonChip, (counts.get(reasonChip) ?? 0) + 1);
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "other";
}

function buildClusterRecord(args: {
  sessionId: string;
  questions: QuestionRow[];
  existingClusters: ClusterRow[];
  lessonMarkers: LessonMarkerInput[];
  sessionLanguage?: string;
  source: "ai" | "fallback";
}) {
  const { questions, existingClusters, lessonMarkers, sessionId, sessionLanguage, source } = args;
  const keywordAnchors = getKeywordAnchors(questions.map((question) => question.text).join(" "));
  const reasonChip = pickDominantReasonChip(questions, sessionLanguage);
  const lessonMarkerVotes = new Map<string, number>();

  questions.forEach((question) => {
    const lessonMarkerId = resolveLessonMarkerId(question, lessonMarkers);
    if (lessonMarkerId) {
      lessonMarkerVotes.set(lessonMarkerId, (lessonMarkerVotes.get(lessonMarkerId) ?? 0) + 1);
    }
  });

  const lessonMarkerId =
    [...lessonMarkerVotes.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const clusterId = buildClusterId(sessionId, reasonChip, lessonMarkerId, keywordAnchors);
  const existingCluster = existingClusters.find((cluster) => cluster.id === clusterId);
  const studentIds = new Set(questions.map((question) => question.anonymous_id));
  const updatedAt =
    [...questions]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0]?.timestamp ?? null;
  const createdAt =
    [...questions]
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))[0]?.timestamp ??
    new Date().toISOString();

  return {
    id: clusterId,
    session_id: sessionId,
    title: buildClusterTitle(reasonChip, keywordAnchors),
    summary: buildClusterSummary(reasonChip, keywordAnchors, studentIds.size),
    affected_count: studentIds.size,
    representative_question:
      pickRepresentativeQuestion(questions) ?? questions[0]?.text ?? "Untitled question cluster",
    reason_chip: reasonChip,
    lesson_marker_id: lessonMarkerId,
    translation: existingCluster?.translation ?? null,
    keyword_anchors: keywordAnchors,
    latest_question_at: updatedAt,
    source,
    status: existingCluster?.status ?? "active",
    suggested_interventions:
      existingCluster?.suggested_interventions?.length
        ? existingCluster.suggested_interventions
        : buildSuggestedInterventions(reasonChip, sessionLanguage),
    created_at: existingCluster?.created_at ?? createdAt,
    updated_at: updatedAt ?? existingCluster?.updated_at ?? new Date().toISOString(),
  } satisfies ClusterRow;
}

function buildKeywordClusters(args: {
  sessionId: string;
  questions: QuestionRow[];
  existingClusters: ClusterRow[];
  lessonMarkers: LessonMarkerInput[];
  sessionLanguage?: string;
  source: "ai" | "fallback";
}) {
  const { questions, existingClusters, lessonMarkers, sessionId, sessionLanguage, source } = args;

  type ClusterAccumulator = {
    keywordAnchors: string[];
    keywordSet: Set<string>;
    reasonChip: ReasonChip;
    lessonMarkerId: string | null;
    questions: QuestionRow[];
  };

  const accumulators: ClusterAccumulator[] = [];

  [...questions]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .forEach((question) => {
      const questionReasonChip = inferReasonChip(question, sessionLanguage);
      const questionKeywordAnchors = getKeywordAnchors(question.text);
      const questionKeywordSet = new Set(questionKeywordAnchors);
      const lessonMarkerId = resolveLessonMarkerId(question, lessonMarkers);

      let bestAccumulator: ClusterAccumulator | null = null;
      let bestScore = 0;

      for (const candidate of accumulators) {
        let score = jaccard(candidate.keywordSet, questionKeywordSet);

        if (candidate.reasonChip === questionReasonChip) {
          score += 0.35;
        }

        if (candidate.lessonMarkerId && lessonMarkerId && candidate.lessonMarkerId === lessonMarkerId) {
          score += 0.2;
        }

        if (score > bestScore) {
          bestAccumulator = candidate;
          bestScore = score;
        }
      }

      if (
        bestAccumulator &&
        (bestScore >= 0.55 ||
          (bestAccumulator.reasonChip === questionReasonChip &&
            ((bestAccumulator.lessonMarkerId &&
              bestAccumulator.lessonMarkerId === lessonMarkerId) ||
              bestScore >= 0.35)))
      ) {
        bestAccumulator.keywordAnchors = mergeKeywordAnchors(
          bestAccumulator.keywordAnchors,
          questionKeywordAnchors
        );
        bestAccumulator.keywordSet = new Set(bestAccumulator.keywordAnchors);
        bestAccumulator.questions.push(question);
        if (!bestAccumulator.lessonMarkerId) {
          bestAccumulator.lessonMarkerId = lessonMarkerId;
        }
        return;
      }

      accumulators.push({
        keywordAnchors: questionKeywordAnchors,
        keywordSet: questionKeywordSet,
        reasonChip: questionReasonChip,
        lessonMarkerId,
        questions: [question],
      });
    });

  return accumulators.map((accumulator) =>
    buildClusterRecord({
      sessionId,
      questions: accumulator.questions,
      existingClusters,
      lessonMarkers,
      sessionLanguage,
      source,
    })
  );
}

async function buildSemanticClusters(args: {
  supabaseAdmin: ReturnType<typeof createClient>;
  sessionId: string;
  questions: QuestionRow[];
  existingClusters: ClusterRow[];
  lessonMarkers: LessonMarkerInput[];
  sessionLanguage?: string;
}) {
  const { supabaseAdmin, sessionId, questions, existingClusters, lessonMarkers, sessionLanguage } =
    args;

  const visited = new Set<string>();
  const clusters: ClusterRow[] = [];
  const semanticCandidates = questions.filter((question) => question.embedding);

  for (const question of semanticCandidates) {
    if (!question.embedding || visited.has(question.id)) {
      continue;
    }

    try {
      const { data, error } = await supabaseAdmin.rpc("match_question_neighbors", {
        target_session_id: sessionId,
        target_embedding: question.embedding,
        similarity_threshold: 0.79,
        max_matches: 10,
      });

      if (error) {
        throw error;
      }

      const group = questions.filter(
        (candidate) =>
          candidate.id === question.id ||
          ((data as QuestionRow[] | null) ?? []).some((match) => match.id === candidate.id)
      );
      const unvisitedGroup = group.filter((candidate) => !visited.has(candidate.id));

      if (unvisitedGroup.length < 2) {
        continue;
      }

      unvisitedGroup.forEach((candidate) => visited.add(candidate.id));
      clusters.push(
        buildClusterRecord({
          sessionId,
          questions: unvisitedGroup,
          existingClusters,
          lessonMarkers,
          sessionLanguage,
          source: "ai",
        })
      );
    } catch {
      break;
    }
  }

  const leftovers = questions.filter((question) => !visited.has(question.id));

  return [
    ...clusters,
    ...buildKeywordClusters({
      sessionId,
      questions: leftovers,
      existingClusters,
      lessonMarkers,
      sessionLanguage,
      source: "fallback",
    }),
  ];
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "Missing Supabase service role configuration." },
      { status: 500 }
    );
  }

  try {
    const { sessionId, force = false, lessonMarkers = [], sessionLanguage } =
      (await request.json()) as {
        sessionId?: string;
        force?: boolean;
        lessonMarkers?: LessonMarkerInput[];
        sessionLanguage?: string;
      };

    if (!sessionId) {
      return jsonResponse({ error: "sessionId is required." }, { status: 400 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [questionResult, existingClusterResult] = await Promise.all([
      supabaseAdmin
        .from(QUESTION_TABLE)
        .select("id, session_id, anonymous_id, text, language, lesson_marker_id, embedding, timestamp")
        .eq("session_id", sessionId)
        .order("timestamp", { ascending: false })
        .limit(120),
      supabaseAdmin
        .from(CLUSTER_TABLE)
        .select("*")
        .eq("session_id", sessionId),
    ]);

    if (questionResult.error) {
      throw questionResult.error;
    }

    if (existingClusterResult.error) {
      throw existingClusterResult.error;
    }

    const questions = (questionResult.data ?? []) as QuestionRow[];
    const existingClusters = (existingClusterResult.data ?? []) as ClusterRow[];

    if (questions.length === 0) {
      if (existingClusters.length > 0) {
        const { error } = await supabaseAdmin
          .from(CLUSTER_TABLE)
          .delete()
          .eq("session_id", sessionId);

        if (error) {
          throw error;
        }
      }

      return jsonResponse({ clusters: [] });
    }

    const latestQuestionAt = questions[0]?.timestamp;
    const latestClusterAt = [...existingClusters]
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0]?.updated_at;

    if (!force && latestQuestionAt && latestClusterAt && latestClusterAt >= latestQuestionAt) {
      return jsonResponse({
        clusters: existingClusters.sort((left, right) =>
          right.updated_at.localeCompare(left.updated_at)
        ),
      });
    }

    const clusters =
      questions.filter((question) => question.embedding).length >= 2
        ? await buildSemanticClusters({
            supabaseAdmin,
            sessionId,
            questions,
            existingClusters,
            lessonMarkers,
            sessionLanguage,
          })
        : buildKeywordClusters({
            sessionId,
            questions,
            existingClusters,
            lessonMarkers,
            sessionLanguage,
            source: "fallback",
          });

    const dedupedClusters = [...new Map(clusters.map((cluster) => [cluster.id, cluster])).values()]
      .sort((left, right) => {
        if (right.affected_count !== left.affected_count) {
          return right.affected_count - left.affected_count;
        }

        return right.updated_at.localeCompare(left.updated_at);
      })
      .slice(0, 12);

    if (dedupedClusters.length > 0) {
      const { error } = await supabaseAdmin
        .from(CLUSTER_TABLE)
        .upsert(dedupedClusters, { onConflict: "id" });

      if (error) {
        throw error;
      }
    }

    const staleClusterIds = existingClusters
      .map((cluster) => cluster.id)
      .filter(
        (clusterId) => !dedupedClusters.some((cluster) => cluster.id === clusterId)
      );

    if (staleClusterIds.length > 0) {
      const { error } = await supabaseAdmin
        .from(CLUSTER_TABLE)
        .delete()
        .in("id", staleClusterIds)
        .eq("session_id", sessionId);

      if (error) {
        throw error;
      }
    }

    return jsonResponse({ clusters: dedupedClusters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown clustering error.";
    return jsonResponse({ error: message }, { status: 500 });
  }
});
