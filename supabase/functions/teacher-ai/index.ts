import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type ReasonChip =
  | "step_unclear"
  | "language_friction"
  | "missing_prerequisite"
  | "too_fast"
  | "notation_confusion"
  | "example_needed"
  | "other";

interface ClusterContext {
  clusterId: string;
  title: string;
  summary: string;
  representativeQuestion: string;
  topic: string;
  subject: string;
  language: string;
  affectedCount: number;
  reasonChip?: ReasonChip;
  translation?: string;
  suggestedInterventions?: string[];
}

interface ReteachPack {
  simpleExplanation: string;
  localLanguageExplanation?: string;
  analogyExplanation: string;
  boardScript: string;
  misconceptionExample: string;
}

interface AIQuickPollSuggestion {
  question: string;
  options: string[];
  correctIndex: number;
  rationale: string;
}

interface SessionSummaryAIInput {
  subject: string;
  topic: string;
  gradeClass: string;
  durationMinutes: number;
  totalParticipants: number;
  peakMomentLabel?: string;
  peakConfusionIndex: number;
  peakLostPercent: number;
  endingConfusionIndex: number;
  endingLostPercent: number;
  topClusterTitle?: string;
  topClusterAffectedCount?: number;
  topReasonChip?: string;
  dominantPollOption?: string;
  dominantPollPercent?: number;
  bestInterventionType?: string;
  bestInterventionRecovery?: number;
  recoveryScore: number;
}

interface AISessionSummary {
  narrative: string;
  suggestedOpeningActivity: string;
  source: "edge" | "fallback";
}

interface AIWeeklyCoaching {
  mostDifficultTopic: string;
  worstTimeSlot: string;
  bestInterventionStyle: string;
  revisionPriorities: string[];
  narrative: string;
}

interface WeeklyTopicDifficultyCell {
  subject: string;
  topic: string;
  avgDifficultyScore: number;
}

interface WeeklyHeatmapCell {
  dayLabel: string;
  slotLabel: string;
  avgConfusionIndex: number;
  avgRecoveryScore: number;
  sessionCount: number;
}

interface WeeklyInterventionTrend {
  type: string;
  usageCount: number;
  successfulCount: number;
  avgRecoveryScore: number;
}

interface WeeklyRecurringMisconception {
  title: string;
}

interface WeeklyLanguageFrictionPoint {
  date: string;
  label: string;
  sessionCount: number;
  frictionSessionCount: number;
  frictionRate: number;
}

interface WeeklyInsightAggregate {
  totalSessions: number;
  topicDifficultyHeatmap: WeeklyTopicDifficultyCell[];
  classPeriodConfusionHeatmap: WeeklyHeatmapCell[];
  interventionEffectivenessTrends: WeeklyInterventionTrend[];
  recurringMisconceptions: WeeklyRecurringMisconception[];
  languageFrictionTrend: WeeklyLanguageFrictionPoint[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function buildTopicHandle(context: ClusterContext) {
  return context.title.replace(/^Questions about\s+/i, "").trim() || context.topic;
}

function buildReasonHint(reasonChip?: ReasonChip) {
  switch (reasonChip) {
    case "step_unclear":
      return "Students are losing the sequence of steps.";
    case "language_friction":
      return "Wording and classroom language may be blocking comprehension.";
    case "missing_prerequisite":
      return "The cluster points to a missing prerequisite concept.";
    case "too_fast":
      return "The pace looks faster than the room can comfortably track.";
    case "notation_confusion":
      return "Symbols or notation appear to be causing friction.";
    case "example_needed":
      return "Students want one more worked example before moving on.";
    default:
      return "Students need a tighter explanation and a quick check for understanding.";
  }
}

function buildPollOptions(context: ClusterContext) {
  const focus = buildTopicHandle(context);

  return [
    `I can explain ${focus} clearly.`,
    `I know the first step but not the full method.`,
    `I need one more example.`,
    `I am still confused about the idea itself.`,
  ];
}

function buildReteachPack(ctx: ClusterContext): ReteachPack {
  const focus = buildTopicHandle(ctx);
  const reasonHint = buildReasonHint(ctx.reasonChip);

  return {
    simpleExplanation: `Let's slow down and rebuild ${focus} in one clean pass. ${reasonHint} Start from the representative question, name the key term, then walk the class through the next small step before asking for a thumbs check.`,
    localLanguageExplanation:
      ctx.translation ??
      `If needed, restate the explanation in ${ctx.language} using shorter phrases and one concrete example.`,
    analogyExplanation: `${focus} can be reframed like a checkpoint path: students should know where they start, what rule they apply, and what the result should look like before they move on.`,
    boardScript: `1. Write the student question: "${ctx.representativeQuestion}"\n2. Circle the part causing friction.\n3. Solve one example slowly.\n4. Ask the class which step changes next and why.\n5. Re-check the room with a quick poll.`,
    misconceptionExample: `A common mistake is jumping to the final answer before checking the middle step in ${focus}. Show the incorrect step first, then correct it side by side.`,
  };
}

function buildQuickPoll(ctx: ClusterContext): AIQuickPollSuggestion {
  const focus = buildTopicHandle(ctx);

  return {
    question: `Quick check on ${focus}: which statement best matches your understanding right now?`,
    options: buildPollOptions(ctx),
    correctIndex: 0,
    rationale:
      "This poll separates confident understanding from step-level confusion so the teacher can choose between moving on, reworking an example, or slowing the pace.",
  };
}

function formatInterventionHandle(value?: string) {
  if (!value) {
    return "a short reteach reset";
  }

  if (value === "language_switch") {
    return "a language switch";
  }

  if (value === "board_script") {
    return "a board walkthrough";
  }

  if (value === "bilingual_explanation") {
    return "a bilingual explanation";
  }

  return value.replace(/_/g, " ");
}

function buildSessionSummary(input: SessionSummaryAIInput): AISessionSummary {
  const peakMoment = input.peakMomentLabel
    ? `during ${input.peakMomentLabel}`
    : "during the busiest point of the lesson";
  const dominantSignal = input.dominantPollOption
    ? `Most students selected "${input.dominantPollOption}" (${input.dominantPollPercent?.toFixed(0) ?? 0}%).`
    : input.topClusterTitle
      ? `The biggest misconception cluster centered on ${input.topClusterTitle.toLowerCase()}.`
      : input.topReasonChip
        ? `The dominant friction signal was ${input.topReasonChip.replace(/_/g, " ")}.`
        : "Students surfaced a few different confusion patterns rather than one dominant signal.";
  const interventionLine =
    input.bestInterventionType && input.bestInterventionRecovery != null
      ? `After ${formatInterventionHandle(input.bestInterventionType)}, Lost dropped from ${input.peakLostPercent.toFixed(1)}% to ${input.endingLostPercent.toFixed(1)}%.`
      : `Lost moved from ${input.peakLostPercent.toFixed(1)}% at the peak to ${input.endingLostPercent.toFixed(1)}% by the close.`;

  let suggestedOpeningActivity = `Begin the next ${input.subject} class with a 3-minute recap of ${input.topic}, then ask one confidence check before introducing anything new.`;

  switch (input.topReasonChip) {
    case "step_unclear":
      suggestedOpeningActivity =
        "Open with one worked example broken into numbered steps, then ask students to predict the next move before you solve it.";
      break;
    case "language_friction":
      suggestedOpeningActivity =
        "Start with a bilingual vocabulary warm-up: restate the key terms in simpler language, then ask a student to paraphrase the idea.";
      break;
    case "notation_confusion":
      suggestedOpeningActivity =
        "Begin with a symbol check: put the key notation on the board, contrast the common mistake, and have students explain what each symbol means.";
      break;
    case "example_needed":
      suggestedOpeningActivity =
        "Start with one fresh worked example and pause midway so students can call out the next step before you continue.";
      break;
    case "missing_prerequisite":
      suggestedOpeningActivity =
        "Use the opener to rebuild the prerequisite idea in one minute, then connect it directly to today’s first question.";
      break;
    case "too_fast":
      suggestedOpeningActivity =
        "Open with a slower recap of yesterday’s transition point and give the room ten silent seconds before students answer.";
      break;
    default:
      break;
  }

  return {
    narrative: `Confusion peaked ${peakMoment} at ${input.peakConfusionIndex.toFixed(1)}. ${dominantSignal} ${interventionLine} Recovery closed at ${input.recoveryScore.toFixed(0)} out of 100.`,
    suggestedOpeningActivity,
    source: "edge",
  };
}

function formatTopicSummary(topic?: WeeklyTopicDifficultyCell) {
  if (!topic) {
    return "No clear topic yet";
  }

  return `${topic.topic} (${topic.subject})`;
}

function getWorstHeatmapCell(heatmap?: WeeklyHeatmapCell[]) {
  return (heatmap ?? [])
    .filter((cell) => cell.sessionCount > 0)
    .sort(
      (left, right) =>
        right.avgConfusionIndex - left.avgConfusionIndex ||
        left.avgRecoveryScore - right.avgRecoveryScore ||
        right.sessionCount - left.sessionCount
    )[0];
}

function getBestIntervention(trends?: WeeklyInterventionTrend[]) {
  return (trends ?? [])
    .filter((trend) => trend.usageCount > 0)
    .sort(
      (left, right) =>
        right.avgRecoveryScore - left.avgRecoveryScore ||
        right.successfulCount - left.successfulCount ||
        right.usageCount - left.usageCount
    )[0];
}

function getPeakLanguageFriction(trend?: WeeklyLanguageFrictionPoint[]) {
  return (trend ?? [])
    .filter((point) => point.sessionCount > 0)
    .sort(
      (left, right) =>
        right.frictionRate - left.frictionRate ||
        right.frictionSessionCount - left.frictionSessionCount ||
        left.date.localeCompare(right.date)
    )[0];
}

function buildWeeklyInsight(input: WeeklyInsightAggregate): AIWeeklyCoaching {
  if (input.totalSessions <= 0) {
    return {
      mostDifficultTopic: "Not enough sessions yet",
      worstTimeSlot: "Not enough sessions yet",
      bestInterventionStyle: "Not enough interventions yet",
      revisionPriorities: ["Teach a few more sessions in this range to unlock coaching."],
      narrative: "Weekly insight will become more useful after multiple saved summaries.",
    };
  }

  const mostDifficultTopic = formatTopicSummary(input.topicDifficultyHeatmap?.[0]);
  const worstTimeSlotCell = getWorstHeatmapCell(input.classPeriodConfusionHeatmap);
  const worstTimeSlot = worstTimeSlotCell
    ? `${worstTimeSlotCell.dayLabel} ${worstTimeSlotCell.slotLabel}`
    : "No time-slot signal yet";
  const bestIntervention = getBestIntervention(input.interventionEffectivenessTrends);
  const bestInterventionStyle = bestIntervention
    ? formatInterventionHandle(bestIntervention.type)
    : "Not enough interventions yet";
  const topCluster = input.recurringMisconceptions?.[0];
  const peakLanguageFriction = getPeakLanguageFriction(input.languageFrictionTrend);
  const revisionPriorities = [
    input.topicDifficultyHeatmap?.[0]
      ? `Revisit ${input.topicDifficultyHeatmap[0].topic} in ${input.topicDifficultyHeatmap[0].subject}; difficulty is averaging ${input.topicDifficultyHeatmap[0].avgDifficultyScore.toFixed(0)}.`
      : null,
    topCluster
      ? `Address the recurring misconception "${topCluster.title}" before new content builds on it.`
      : null,
    peakLanguageFriction && peakLanguageFriction.frictionRate > 0
      ? `Pre-teach vocabulary or use bilingual framing around ${peakLanguageFriction.label}; language friction appeared in ${peakLanguageFriction.frictionRate.toFixed(0)}% of sessions that day.`
      : worstTimeSlotCell
        ? `Plan a shorter recap and faster comprehension checks for ${worstTimeSlot.toLowerCase()}.`
        : null,
  ].filter((item): item is string => Boolean(item));

  return {
    mostDifficultTopic,
    worstTimeSlot,
    bestInterventionStyle,
    revisionPriorities,
    narrative: `Across ${input.totalSessions} sessions, ${mostDifficultTopic} created the heaviest strain. ${worstTimeSlot} showed the highest confusion signal, while ${bestInterventionStyle} delivered the strongest recovery pattern.`,
  };
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await request.json()) as {
      action?:
        | "generateReteachPack"
        | "generateQuickPoll"
        | "generateSessionSummary"
        | "generateWeeklyInsight";
      clusterContext?: ClusterContext;
      summaryInput?: SessionSummaryAIInput;
      weeklyInsight?: WeeklyInsightAggregate;
    };

    const action = body.action;
    const clusterContext = body.clusterContext;
    const summaryInput = body.summaryInput;
    const weeklyInsight = body.weeklyInsight;

    if (!action) {
      return jsonResponse({ error: "Action is required." }, { status: 400 });
    }

    if (action === "generateReteachPack") {
      if (!clusterContext) {
        return jsonResponse(
          { error: "clusterContext is required for generateReteachPack." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildReteachPack(clusterContext) });
    }

    if (action === "generateQuickPoll") {
      if (!clusterContext) {
        return jsonResponse(
          { error: "clusterContext is required for generateQuickPoll." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildQuickPoll(clusterContext) });
    }

    if (action === "generateSessionSummary") {
      if (!summaryInput) {
        return jsonResponse(
          { error: "summaryInput is required for generateSessionSummary." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildSessionSummary(summaryInput) });
    }

    if (action === "generateWeeklyInsight") {
      if (!weeklyInsight) {
        return jsonResponse(
          { error: "weeklyInsight is required for generateWeeklyInsight." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildWeeklyInsight(weeklyInsight) });
    }

    return jsonResponse({ error: "Unsupported AI action." }, { status: 400 });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown teacher AI function error.",
      },
      { status: 500 }
    );
  }
});
