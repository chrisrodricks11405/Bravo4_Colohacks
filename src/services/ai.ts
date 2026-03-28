import type {
  AIProvider,
  VoiceProvider,
  AISessionSummary,
  ClusterContext,
  ReteachPack,
  AIQuickPollSuggestion,
  AISessionStarter,
  SessionSummaryAIInput,
  AIWeeklyCoaching,
  WeeklyHeatmapCell,
  WeeklyInsightAggregate,
  WeeklyInterventionTrend,
  WeeklyLanguageFrictionPoint,
} from "../types";
import { hasSupabaseConfig, supabase } from "../lib/supabase";

const teacherAIFunction =
  process.env.EXPO_PUBLIC_SUPABASE_TEACHER_AI_FUNCTION ?? "teacher-ai";

function buildTopicHandle(context: ClusterContext) {
  return context.title.replace(/^Questions about\s+/i, "").trim() || context.topic;
}

function buildReasonHint(reasonChip?: string) {
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

function buildSummaryNarrative(input: SessionSummaryAIInput): AISessionSummary {
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

  const narrative = `Confusion peaked ${peakMoment} at ${input.peakConfusionIndex.toFixed(1)}. ${dominantSignal} ${interventionLine} Recovery closed at ${input.recoveryScore.toFixed(0)} out of 100.`;

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
    narrative,
    suggestedOpeningActivity,
    source: "fallback",
  };
}

function formatTopicSummary(
  topic?: { topic: string; subject: string }
) {
  if (!topic) {
    return "No clear topic yet";
  }

  return `${topic.topic} (${topic.subject})`;
}

function getWorstHeatmapCell(
  heatmap?: WeeklyHeatmapCell[]
) {
  return (heatmap ?? [])
    .filter((cell) => cell.sessionCount > 0)
    .sort(
      (left, right) =>
        right.avgConfusionIndex - left.avgConfusionIndex ||
        left.avgRecoveryScore - right.avgRecoveryScore ||
        right.sessionCount - left.sessionCount
    )[0];
}

function getBestInterventionTrend(
  trends?: WeeklyInterventionTrend[]
) {
  return (trends ?? [])
    .filter((trend) => trend.usageCount > 0)
    .sort(
      (left, right) =>
        right.avgRecoveryScore - left.avgRecoveryScore ||
        right.successfulCount - left.successfulCount ||
        right.usageCount - left.usageCount
    )[0];
}

function getPeakLanguageFrictionPoint(
  trend?: WeeklyLanguageFrictionPoint[]
) {
  return (trend ?? [])
    .filter((point) => point.sessionCount > 0)
    .sort(
      (left, right) =>
        right.frictionRate - left.frictionRate ||
        right.frictionSessionCount - left.frictionSessionCount ||
        left.date.localeCompare(right.date)
    )[0];
}

function buildWeeklyNarrative(summaryData: unknown): AIWeeklyCoaching {
  const insight = summaryData as Partial<WeeklyInsightAggregate>;

  if (!insight || typeof insight.totalSessions !== "number" || insight.totalSessions <= 0) {
    return {
      mostDifficultTopic: "Not enough sessions yet",
      worstTimeSlot: "Not enough sessions yet",
      bestInterventionStyle: "Not enough interventions yet",
      revisionPriorities: ["Teach a few more sessions in this range to unlock coaching."],
      narrative: "Weekly insight will become more useful after multiple saved summaries.",
    };
  }

  const mostDifficultTopic = formatTopicSummary(insight.topicDifficultyHeatmap?.[0]);
  const worstTimeSlotCell = getWorstHeatmapCell(insight.classPeriodConfusionHeatmap);
  const worstTimeSlot = worstTimeSlotCell
    ? `${worstTimeSlotCell.dayLabel} ${worstTimeSlotCell.slotLabel}`
    : "No time-slot signal yet";
  const bestIntervention = getBestInterventionTrend(
    insight.interventionEffectivenessTrends
  );
  const bestInterventionStyle = bestIntervention
    ? formatInterventionHandle(bestIntervention.type)
    : "Not enough interventions yet";
  const topCluster = insight.recurringMisconceptions?.[0];
  const peakLanguageFriction = getPeakLanguageFrictionPoint(
    insight.languageFrictionTrend
  );
  const revisionPriorities = [
    insight.topicDifficultyHeatmap?.[0]
      ? `Revisit ${insight.topicDifficultyHeatmap[0].topic} in ${insight.topicDifficultyHeatmap[0].subject}; difficulty is averaging ${insight.topicDifficultyHeatmap[0].avgDifficultyScore.toFixed(0)}.`
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
    narrative: `Across ${insight.totalSessions} sessions, ${mostDifficultTopic} created the heaviest strain. ${worstTimeSlot} showed the highest confusion signal, while ${bestInterventionStyle} delivered the strongest recovery pattern.`,
  };
}

export class StubAIProvider implements AIProvider {
  async generateReteachPack(ctx: ClusterContext): Promise<ReteachPack> {
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

  async generateQuickPoll(ctx: ClusterContext): Promise<AIQuickPollSuggestion> {
    const focus = buildTopicHandle(ctx);

    return {
      question: `Quick check on ${focus}: which statement best matches your understanding right now?`,
      options: buildPollOptions(ctx),
      correctIndex: 0,
      rationale: "This poll separates confident understanding from step-level confusion so the teacher can choose between moving on, reworking an example, or slowing the pace.",
    };
  }

  async generateSessionStarter(
    _topic: string,
    _subject: string,
    _language: string
  ): Promise<AISessionStarter> {
    return {
      likelyMisconceptions: [],
      expectedDifficultSteps: [],
    };
  }

  async generateSessionSummary(
    summaryInput: SessionSummaryAIInput
  ): Promise<AISessionSummary> {
    return buildSummaryNarrative(summaryInput);
  }

  async generateWeeklyInsight(summaryData: unknown): Promise<AIWeeklyCoaching> {
    return buildWeeklyNarrative(summaryData);
  }
}

class EdgeFunctionAIProvider implements AIProvider {
  private readonly fallbackProvider = new StubAIProvider();

  private async invoke<TResponse>(
    action: "generateReteachPack" | "generateQuickPoll",
    clusterContext: ClusterContext
  ): Promise<TResponse> {
    if (!hasSupabaseConfig) {
      throw new Error("AI provider is unavailable until Supabase is configured.");
    }

    const { data, error } = await supabase.functions.invoke(teacherAIFunction, {
      body: {
        action,
        clusterContext,
      },
    });

    if (error) {
      throw error;
    }

    if (!data || typeof data !== "object" || !("result" in data)) {
      throw new Error("AI provider returned an unexpected response.");
    }

    return (data as { result: TResponse }).result;
  }

  private async invokeSummary<TResponse>(
    action: "generateSessionSummary",
    summaryInput: SessionSummaryAIInput
  ): Promise<TResponse> {
    if (!hasSupabaseConfig) {
      throw new Error("AI provider is unavailable until Supabase is configured.");
    }

    const { data, error } = await supabase.functions.invoke(teacherAIFunction, {
      body: {
        action,
        summaryInput,
      },
    });

    if (error) {
      throw error;
    }

    if (!data || typeof data !== "object" || !("result" in data)) {
      throw new Error("AI provider returned an unexpected response.");
    }

    return (data as { result: TResponse }).result;
  }

  private async invokeWeekly<TResponse>(
    action: "generateWeeklyInsight",
    weeklyInsight: unknown
  ): Promise<TResponse> {
    if (!hasSupabaseConfig) {
      throw new Error("AI provider is unavailable until Supabase is configured.");
    }

    const { data, error } = await supabase.functions.invoke(teacherAIFunction, {
      body: {
        action,
        weeklyInsight,
      },
    });

    if (error) {
      throw error;
    }

    if (!data || typeof data !== "object" || !("result" in data)) {
      throw new Error("AI provider returned an unexpected response.");
    }

    return (data as { result: TResponse }).result;
  }

  async generateReteachPack(ctx: ClusterContext): Promise<ReteachPack> {
    try {
      return await this.invoke<ReteachPack>("generateReteachPack", ctx);
    } catch {
      return this.fallbackProvider.generateReteachPack(ctx);
    }
  }

  async generateQuickPoll(ctx: ClusterContext): Promise<AIQuickPollSuggestion> {
    try {
      return await this.invoke<AIQuickPollSuggestion>("generateQuickPoll", ctx);
    } catch {
      return this.fallbackProvider.generateQuickPoll(ctx);
    }
  }

  async generateSessionStarter(
    topic: string,
    subject: string,
    language: string
  ): Promise<AISessionStarter> {
    return this.fallbackProvider.generateSessionStarter(topic, subject, language);
  }

  async generateWeeklyInsight(summaryData: unknown): Promise<AIWeeklyCoaching> {
    try {
      return await this.invokeWeekly<AIWeeklyCoaching>(
        "generateWeeklyInsight",
        summaryData
      );
    } catch {
      return this.fallbackProvider.generateWeeklyInsight(summaryData);
    }
  }

  async generateSessionSummary(
    summaryInput: SessionSummaryAIInput
  ): Promise<AISessionSummary> {
    try {
      const result = await this.invokeSummary<AISessionSummary>(
        "generateSessionSummary",
        summaryInput
      );

      return {
        ...result,
        source: "edge",
      };
    } catch {
      return this.fallbackProvider.generateSessionSummary(summaryInput);
    }
  }
}

/**
 * Stub Voice provider — placeholder for voice features.
 * Will be replaced with real provider in Stage 11.
 */
export class StubVoiceProvider implements VoiceProvider {
  async transcribe(_audioUri: string): Promise<string> {
    return "Voice transcription placeholder.";
  }

  async speak(_text: string, _locale: string): Promise<string> {
    return "";
  }
}

// Default singletons
export const aiProvider: AIProvider = new EdgeFunctionAIProvider();
export const voiceProvider: VoiceProvider = new StubVoiceProvider();
