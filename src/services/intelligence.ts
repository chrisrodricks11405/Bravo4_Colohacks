import type {
  IntelligenceDashboard,
  IntelligenceFeature,
  IntelligenceMetric,
  ReasonChip,
  SessionSummaryPayload,
  TeacherPreferences,
  WeeklyInsightPayload,
  WeeklyInterventionTrend,
  WeeklyRecurringMisconception,
} from "../types";

interface BuildIntelligenceDashboardOptions {
  summaries: SessionSummaryPayload[];
  weeklyInsight: WeeklyInsightPayload | null;
  preferences: Partial<TeacherPreferences>;
}

const REASON_LABELS: Record<ReasonChip, string> = {
  step_unclear: "Steps unclear",
  language_friction: "Language friction",
  missing_prerequisite: "Missing prerequisite",
  too_fast: "Pace pressure",
  notation_confusion: "Notation confusion",
  example_needed: "Example needed",
  other: "Mixed signal",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  "en-us": "English",
  english: "English",
  hi: "Hindi",
  hindi: "Hindi",
  mr: "Marathi",
  marathi: "Marathi",
  kn: "Kannada",
  kannada: "Kannada",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatLanguage(value?: string) {
  if (!value) {
    return "English";
  }

  const normalized = value.trim().toLowerCase();
  return LANGUAGE_LABELS[normalized] ?? value.trim();
}

function formatReasonChip(reason?: string) {
  if (!reason) {
    return REASON_LABELS.other;
  }

  return REASON_LABELS[(reason as ReasonChip) ?? "other"] ?? REASON_LABELS.other;
}

function formatInterventionType(value?: string) {
  if (!value) {
    return "short reteach reset";
  }

  switch (value) {
    case "language_switch":
      return "language switch";
    case "board_script":
      return "board walkthrough";
    case "bilingual_explanation":
      return "bilingual explanation";
    default:
      return value.replace(/_/g, " ");
  }
}

function buildReasonCounts(summaries: SessionSummaryPayload[]) {
  const counts: Record<ReasonChip, number> = {
    step_unclear: 0,
    language_friction: 0,
    missing_prerequisite: 0,
    too_fast: 0,
    notation_confusion: 0,
    example_needed: 0,
    other: 0,
  };

  summaries.forEach((summary) => {
    summary.topReasonChips.forEach((entry) => {
      counts[entry.chip] += entry.count;
    });
  });

  return counts;
}

function getDominantReasonChip(summaries: SessionSummaryPayload[]) {
  const counts = buildReasonCounts(summaries);

  return (Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "other") as ReasonChip;
}

function getLatestTopicHandle(
  latestSummary: SessionSummaryPayload | undefined,
  preferences: Partial<TeacherPreferences>
) {
  return latestSummary?.topic?.trim() || preferences.defaultSubject?.trim() || "the next lesson";
}

function getLatestSubjectHandle(
  latestSummary: SessionSummaryPayload | undefined,
  preferences: Partial<TeacherPreferences>
) {
  return latestSummary?.subject?.trim() || preferences.defaultSubject?.trim() || "the class";
}

function getLatestGradeHandle(
  latestSummary: SessionSummaryPayload | undefined,
  preferences: Partial<TeacherPreferences>
) {
  return latestSummary?.gradeClass?.trim() || preferences.defaultGradeClass?.trim() || "the class";
}

function getPrimaryRecurringSignal(
  weeklyInsight: WeeklyInsightPayload | null,
  latestSummary: SessionSummaryPayload | undefined
) {
  if (weeklyInsight?.recurringMisconceptions?.length) {
    return weeklyInsight.recurringMisconceptions[0];
  }

  const cluster = latestSummary?.topClusters[0];

  if (!cluster) {
    return null;
  }

  return {
    key: cluster.id,
    title: cluster.title,
    frequency: 1,
    totalAffectedStudents: cluster.affectedCount,
    subjects: [latestSummary?.subject ?? "Class"],
    dominantReasonChip: cluster.reasonChip,
  } satisfies WeeklyRecurringMisconception;
}

function getTopRecurringSignals(
  weeklyInsight: WeeklyInsightPayload | null,
  latestSummary: SessionSummaryPayload | undefined
) {
  if (weeklyInsight?.recurringMisconceptions?.length) {
    return weeklyInsight.recurringMisconceptions.slice(0, 3);
  }

  return (latestSummary?.topClusters ?? []).slice(0, 3).map((cluster) => ({
    key: cluster.id,
    title: cluster.title,
    frequency: 1,
    totalAffectedStudents: cluster.affectedCount,
    subjects: [latestSummary?.subject ?? "Class"],
    dominantReasonChip: cluster.reasonChip,
  }));
}

function getBestInterventionTrend(
  weeklyInsight: WeeklyInsightPayload | null,
  latestSummary: SessionSummaryPayload | undefined
) {
  const weeklyBest = [...(weeklyInsight?.interventionEffectivenessTrends ?? [])]
    .filter((trend) => trend.usageCount > 0)
    .sort(
      (left, right) =>
        right.avgRecoveryScore - left.avgRecoveryScore ||
        right.successfulCount - left.successfulCount ||
        right.usageCount - left.usageCount
    )[0];

  if (weeklyBest) {
    return weeklyBest;
  }

  const summaryBest = [...(latestSummary?.interventionStats ?? [])]
    .filter((trend) => typeof trend.avgRecoveryScore === "number")
    .sort(
      (left, right) =>
        (right.avgRecoveryScore ?? 0) - (left.avgRecoveryScore ?? 0) ||
        right.successfulCount - left.successfulCount ||
        right.count - left.count
    )[0];

  if (!summaryBest) {
    return null;
  }

  return {
    type: summaryBest.type,
    usageCount: summaryBest.count,
    avgRecoveryScore: summaryBest.avgRecoveryScore ?? 0,
    successfulCount: summaryBest.successfulCount,
    trendDelta: 0,
    trendDirection: "stable",
  } satisfies WeeklyInterventionTrend;
}

function getRiskWindowLabel(
  latestSummary: SessionSummaryPayload | undefined,
  weeklyInsight: WeeklyInsightPayload | null
) {
  const peakMoment = latestSummary?.peakConfusionMoments[0]?.label?.trim();

  if (peakMoment) {
    return peakMoment;
  }

  if (weeklyInsight?.coaching?.worstTimeSlot) {
    return weeklyInsight.coaching.worstTimeSlot;
  }

  return "the first guided example";
}

function getAverageRecovery(summaries: SessionSummaryPayload[]) {
  return average(summaries.map((summary) => summary.overallRecoveryScore));
}

function getAveragePeakConfusion(summaries: SessionSummaryPayload[]) {
  return average(summaries.map((summary) => summary.peakConfusionIndex));
}

function getLanguageFrictionSessionCount(summaries: SessionSummaryPayload[]) {
  return summaries.filter((summary) =>
    summary.topReasonChips.some((entry) => entry.chip === "language_friction")
  ).length;
}

function getMissingPrerequisiteSessionCount(summaries: SessionSummaryPayload[]) {
  return summaries.filter((summary) =>
    summary.topReasonChips.some((entry) => entry.chip === "missing_prerequisite")
  ).length;
}

function getPacePressureSessionCount(summaries: SessionSummaryPayload[]) {
  return summaries.filter((summary) =>
    summary.topReasonChips.some((entry) => entry.chip === "too_fast")
  ).length;
}

function getExplanationDefault(reason: ReasonChip) {
  switch (reason) {
    case "step_unclear":
      return "worked-example first";
    case "language_friction":
      return "plain-language bridge";
    case "notation_confusion":
      return "symbol-by-symbol unpack";
    case "missing_prerequisite":
      return "prerequisite rebuild";
    case "too_fast":
      return "slow recap + pause";
    case "example_needed":
      return "fresh example";
    default:
      return "direct explanation";
  }
}

function getExplanationBackup(reason: ReasonChip) {
  switch (reason) {
    case "language_friction":
      return "bilingual restatement";
    case "step_unclear":
      return "board script";
    case "notation_confusion":
      return "contrastive example";
    default:
      return "analogy";
  }
}

function getPreventiveMove(reason: ReasonChip, topic: string, language: string) {
  switch (reason) {
    case "step_unclear":
      return `Number the first worked example in ${topic} and ask students to predict the next move before you write it.`;
    case "language_friction":
      return `Rephrase the core question in ${language} and invite one student to paraphrase it back in simpler classroom language.`;
    case "missing_prerequisite":
      return `Reconnect the prerequisite idea behind ${topic} before introducing new practice.`;
    case "too_fast":
      return "Pause after the first solved line and give the room silent think time before anyone answers.";
    case "notation_confusion":
      return `Put the critical symbols for ${topic} side by side on the board and name what each one means.`;
    case "example_needed":
      return `Show one extra worked example before asking students to attempt ${topic} alone.`;
    default:
      return `Run a fast confidence check before independent work on ${topic}.`;
  }
}

function buildSocraticLadder(topic: string, reason: ReasonChip) {
  switch (reason) {
    case "step_unclear":
      return [
        `What is the very first thing we know before we start solving ${topic}?`,
        `What changes after the first step, and what stays the same?`,
        `Where would a classmate most likely skip a step here?`,
        `How would you explain the full sequence to someone who missed yesterday's lesson?`,
      ];
    case "language_friction":
      return [
        `How would you restate the question about ${topic} in simpler words?`,
        `Which word or phrase is doing the most work in this problem?`,
        `If we replaced the difficult word, what would the task still ask us to do?`,
        `How would you explain the meaning of the problem without using the textbook sentence?`,
      ];
    case "missing_prerequisite":
      return [
        `What earlier idea do we need before ${topic} makes sense?`,
        `Which part of that earlier idea connects directly to today's problem?`,
        `What breaks if that prerequisite is missing?`,
        `How can we test whether the foundation is strong enough before moving on?`,
      ];
    case "notation_confusion":
      return [
        `What does each symbol in this ${topic} problem tell us to do?`,
        `Which symbol is easiest to misread, and why?`,
        `How would the answer change if we interpreted that symbol incorrectly?`,
        `How can we check the notation before we trust the final answer?`,
      ];
    case "too_fast":
      return [
        `If we paused right now, what single idea should everyone be able to say back?`,
        `Which step deserves ten more seconds of attention before we move on?`,
        `What would happen if we skipped straight to practice here?`,
        `What quick check would prove the class is ready for the next move?`,
      ];
    case "example_needed":
      return [
        `What pattern do you notice in this worked example of ${topic}?`,
        `Where would you reuse that same pattern in a new problem?`,
        `What part of the example would you change while keeping the method the same?`,
        `How would you coach a classmate through a parallel example without doing it for them?`,
      ];
    default:
      return [
        `What do we already know about ${topic}?`,
        "What clue in the question should drive our first move?",
        "What common wrong turn should we rule out early?",
        "How would you convince a skeptical classmate that your reasoning works?",
      ];
  }
}

function buildStallPrompts(reason: ReasonChip, topic: string) {
  switch (reason) {
    case "step_unclear":
      return [
        "Point to the line where the process changes and ask, \"Why does the next move happen here?\"",
        `Cover the final answer and ask students to narrate only the next step in ${topic}.`,
        "Invite one student to act as the checker and another as the explainer.",
      ];
    case "language_friction":
      return [
        "Swap one hard term for everyday classroom language.",
        "Ask students to describe the task without using the original sentence.",
        "Let a bilingual paraphrase come before the formal answer.",
      ];
    default:
      return [
        `Restate the goal of ${topic} in one sentence.`,
        "Ask students to compare the right move with a likely wrong move.",
        "Shrink the problem to a smaller version before scaling back up.",
      ];
  }
}

function buildPeerRoles(reason: ReasonChip) {
  switch (reason) {
    case "step_unclear":
      return [
        "Solver: names the next move only.",
        "Step checker: verifies the sequence and spots skipped reasoning.",
        "Explainer: retells the method after the pair finishes.",
      ];
    case "language_friction":
      return [
        "Paraphraser: rewrites the task in simpler words.",
        "Example finder: points to the matching worked example.",
        "Explainer: says the idea back in the class language and then the formal term.",
      ];
    case "notation_confusion":
      return [
        "Symbol reader: names what each symbol means.",
        "Comparator: contrasts the correct notation with the common mistake.",
        "Explainer: links the notation to the final method.",
      ];
    default:
      return [
        "Anchor: starts the reasoning without giving away the answer.",
        "Checker: asks, \"How do we know?\" at each step.",
        "Summarizer: closes with the method in one sentence.",
      ];
  }
}

function buildMetric(label: string, value: string): IntelligenceMetric {
  return { label, value };
}

function buildClassroomTwinFeature(args: {
  latestSummary?: SessionSummaryPayload;
  weeklyInsight: WeeklyInsightPayload | null;
  preferences: Partial<TeacherPreferences>;
  dominantReason: ReasonChip;
  averageRecovery: number;
  averagePeakConfusion: number;
  summariesAnalyzed: number;
}) {
  const {
    latestSummary,
    weeklyInsight,
    preferences,
    dominantReason,
    averageRecovery,
    averagePeakConfusion,
    summariesAnalyzed,
  } = args;
  const topic = getLatestTopicHandle(latestSummary, preferences);
  const subject = getLatestSubjectHandle(latestSummary, preferences);
  const recurringSignal = getPrimaryRecurringSignal(weeklyInsight, latestSummary);
  const bestIntervention = getBestInterventionTrend(weeklyInsight, latestSummary);
  const riskWindow = getRiskWindowLabel(latestSummary, weeklyInsight);
  const twinConfidence = clamp(
    36 + summariesAnalyzed * 7 + (weeklyInsight ? 14 : 0) + (recurringSignal ? 10 : 0),
    32,
    96
  );
  const opener =
    latestSummary?.suggestedNextActivity ??
    `open ${subject} with a crisp recap of ${topic} before new practice begins`;

  return {
    key: "ai_classroom_twin",
    category: "classroom",
    name: "AI Classroom Twin",
    statusLabel: twinConfidence >= 72 ? "Actionable" : "Warming up",
    tone: twinConfidence >= 72 ? "success" : "info",
    summary: `${subject} is now modelled as a live classroom twin that predicts where ${formatReasonChip(dominantReason).toLowerCase()} could resurface before the room fully drifts.`,
    detail:
      "The twin fuses the latest summary, recurring misconception patterns, and intervention history into a pre-class briefing for the teacher.",
    metrics: [
      buildMetric("Twin confidence", formatPercent(twinConfidence)),
      buildMetric("Avg recovery", formatPercent(averageRecovery)),
      buildMetric("Risk window", riskWindow),
    ],
    sections: [
      {
        title: "Twin readout",
        items: [
          `${topic} is the current modelled lesson focus for ${getLatestGradeHandle(latestSummary, preferences)}.`,
          `${formatReasonChip(dominantReason)} is the strongest friction signal across recent sessions.`,
          `Average peak confusion is ${formatPercent(averagePeakConfusion)} before the room settles.`,
        ],
      },
      {
        title: "What it predicts next",
        items: [
          `${riskWindow} is the likeliest wobble point in the next run of this lesson.`,
          recurringSignal
            ? `${recurringSignal.title} is the most likely misconception to reappear.`
            : `The first independent example in ${topic} is the likeliest place for confusion to rebound.`,
          bestIntervention
            ? `${formatInterventionType(bestIntervention.type)} is the fastest stabilizer seen so far.`
            : "A short reteach reset should be prepared before students work alone.",
        ],
      },
      {
        title: "What the twin stages for the teacher",
        items: [
          `Start by ${opener}.`,
          "Insert one confidence check before independent work starts.",
          `Keep a watchlist of ${Math.max(1, weeklyInsight?.recurringMisconceptions.length ?? latestSummary?.topClusters.length ?? 0)} repeating signals instead of reacting only after errors spread.`,
        ],
      },
    ],
    recommendedAction: `Use the twin brief to open the next ${subject} lesson with ${opener}.`,
  } satisfies IntelligenceFeature;
}

function buildMisconceptionForecastingFeature(args: {
  latestSummary?: SessionSummaryPayload;
  weeklyInsight: WeeklyInsightPayload | null;
  preferences: Partial<TeacherPreferences>;
  dominantReason: ReasonChip;
  summariesAnalyzed: number;
  language: string;
}) {
  const { latestSummary, weeklyInsight, preferences, dominantReason, summariesAnalyzed, language } =
    args;
  const topic = getLatestTopicHandle(latestSummary, preferences);
  const topSignals = getTopRecurringSignals(weeklyInsight, latestSummary);
  const riskWindow = getRiskWindowLabel(latestSummary, weeklyInsight);
  const forecastConfidence = clamp(
    28 + topSignals.length * 14 + summariesAnalyzed * 4 + (weeklyInsight ? 10 : 0),
    25,
    95
  );

  return {
    key: "misconception_forecasting",
    category: "classroom",
    name: "Misconception Forecasting",
    statusLabel: topSignals.length > 0 ? "Watchlist ready" : "Collecting patterns",
    tone: topSignals.length > 0 ? "warning" : "neutral",
    summary: `Forecasts the next misconception wave before it becomes a full-class blockage in ${topic}.`,
    detail:
      "Recurring clusters, dominant reason chips, and the hardest time slot combine into a pre-emptive risk model for the teacher.",
    metrics: [
      buildMetric("Forecast confidence", formatPercent(forecastConfidence)),
      buildMetric("Recurring signals", String(topSignals.length)),
      buildMetric("Likely trigger", riskWindow),
    ],
    sections: [
      {
        title: "Likely misconceptions",
        items:
          topSignals.length > 0
            ? topSignals.map(
                (signal) =>
                  `${signal.title} · ${signal.frequency} repeat(s) · ${formatReasonChip(signal.dominantReasonChip)}`
              )
            : [
                `No repeated clusters are cached yet, so the forecast starts from ${formatReasonChip(dominantReason).toLowerCase()}.`,
                `The first new signal to watch in ${topic} is whether students can explain the opening step.`,
              ],
      },
      {
        title: "Why the model is firing",
        items: [
          `${summariesAnalyzed} saved session summary${summariesAnalyzed === 1 ? "" : "ies"} feed this forecast.`,
          `${formatReasonChip(dominantReason)} is the dominant pattern rather than a one-off spike.`,
          `${riskWindow} keeps appearing as a high-risk moment for confusion to surface.`,
        ],
      },
      {
        title: "Preventive moves",
        items: [
          getPreventiveMove(dominantReason, topic, language),
          "Check the room before practice, not after the first wrong answer spreads.",
          "Keep one counterexample ready so the misconception is surfaced safely and corrected quickly.",
        ],
      },
    ],
    recommendedAction: `Use the top forecast as a pre-emptive checkpoint before students attempt ${topic} independently.`,
  } satisfies IntelligenceFeature;
}

function buildSocraticGeneratorFeature(args: {
  latestSummary?: SessionSummaryPayload;
  preferences: Partial<TeacherPreferences>;
  dominantReason: ReasonChip;
}) {
  const { latestSummary, preferences, dominantReason } = args;
  const topic = getLatestTopicHandle(latestSummary, preferences);
  const ladder = buildSocraticLadder(topic, dominantReason);
  const stallPrompts = buildStallPrompts(dominantReason, topic);

  return {
    key: "ai_socratic_question_generator",
    category: "classroom",
    name: "AI Socratic Question Generator",
    statusLabel: "Ready now",
    tone: "primary",
    summary: `Generates a question ladder that diagnoses how students are thinking about ${topic} before the teacher reteaches it.`,
    detail:
      "The prompts are sequenced to move from recall, to reasoning, to transfer, so confusion is uncovered with student language instead of teacher guesses.",
    metrics: [
      buildMetric("Question ladder", `${ladder.length} prompts`),
      buildMetric("Targets", formatReasonChip(dominantReason)),
      buildMetric("Exit check", "Built in"),
    ],
    sections: [
      {
        title: "Question ladder",
        items: ladder,
      },
      {
        title: "If students stall",
        items: stallPrompts,
      },
      {
        title: "What mastery should sound like",
        items: [
          `Students can explain the next move in ${topic}, not only state the answer.`,
          "Students can contrast the correct method with a likely wrong turn.",
          "Students can justify why the process works in their own words.",
        ],
      },
    ],
    recommendedAction: "Ask only the first two Socratic questions before reteaching so student thinking surfaces fast and cleanly.",
  } satisfies IntelligenceFeature;
}

function buildLessonRebuilderFeature(args: {
  latestSummary?: SessionSummaryPayload;
  preferences: Partial<TeacherPreferences>;
  dominantReason: ReasonChip;
  language: string;
}) {
  const { latestSummary, preferences, dominantReason, language } = args;
  const topic = getLatestTopicHandle(latestSummary, preferences);

  return {
    key: "multimodal_lesson_rebuilder",
    category: "classroom",
    name: "Multimodal Lesson Rebuilder",
    statusLabel: "Lesson-ready",
    tone: "info",
    summary: `Turns a worksheet, textbook page, or board image into a rebuilt teaching sequence for ${topic}.`,
    detail:
      "The rebuilder is designed to extract the hidden teaching load from a captured artifact, then rebuild the lesson as an opener, board script, poll, and exit check.",
    metrics: [
      buildMetric("Input modes", "3"),
      buildMetric("Outputs", "4 assets"),
      buildMetric("Primary fix", formatReasonChip(dominantReason)),
    ],
    sections: [
      {
        title: "What the rebuilder extracts",
        items: [
          `The exact step where student work on ${topic} is most likely to drift.`,
          `${formatReasonChip(dominantReason)} hidden inside the source artifact.`,
          "Prerequisite assumptions, dense vocabulary, or overloaded notation that the original artifact makes invisible.",
        ],
      },
      {
        title: "How each source gets transformed",
        items: [
          `Worksheet image -> isolates wrong-turn patterns and converts them into a corrected worked model for ${topic}.`,
          `Page image -> strips reading load, builds a simpler talk track, and highlights vocabulary that should be pre-taught in ${language}.`,
          "Board image -> rebuilds the board flow into a cleaner script with pause points and a quick poll before practice.",
        ],
      },
      {
        title: "Teacher-ready outputs",
        items: [
          "A 5-minute recovery opener that starts from the visible misconception.",
          "A board script with numbered checkpoints rather than one long explanation.",
          "A fast confidence check and one exit-ticket prompt to verify repair.",
        ],
      },
    ],
    recommendedAction: "Use the board-image rebuild when you want the fastest path from a messy explanation to a cleaner reteach sequence.",
  } satisfies IntelligenceFeature;
}

function buildRecoveryEngineFeature(args: {
  latestSummary?: SessionSummaryPayload;
  weeklyInsight: WeeklyInsightPayload | null;
  preferences: Partial<TeacherPreferences>;
  dominantReason: ReasonChip;
  averageRecovery: number;
}) {
  const { latestSummary, weeklyInsight, preferences, dominantReason, averageRecovery } = args;
  const topic = getLatestTopicHandle(latestSummary, preferences);
  const riskWindow = getRiskWindowLabel(latestSummary, weeklyInsight);
  const bestIntervention = getBestInterventionTrend(weeklyInsight, latestSummary);
  const interventionLines =
    [...(latestSummary?.interventionStats ?? [])]
      .sort(
        (left, right) =>
          (right.avgRecoveryScore ?? 0) - (left.avgRecoveryScore ?? 0) ||
          right.successfulCount - left.successfulCount
      )
      .slice(0, 3)
      .map((item) => {
        const recoveryValue =
          typeof item.avgRecoveryScore === "number"
            ? ` · avg recovery ${item.avgRecoveryScore.toFixed(0)}`
            : "";
        return `${formatInterventionType(item.type)}${recoveryValue}`;
      }) ?? [];
  const unresolvedSignals =
    latestSummary?.interventionStats.reduce((sum, item) => sum + item.unresolvedCount, 0) ?? 0;
  const peakConfusion = latestSummary?.peakConfusionIndex ?? averageRecovery;
  const recoveryTrigger = clamp(Math.round(peakConfusion * 0.75), 20, 85);

  return {
    key: "ai_learning_recovery_engine",
    category: "recovery",
    name: "AI Learning Recovery Engine",
    statusLabel: averageRecovery >= 60 ? "Recovery playbook" : "Needs tighter recovery",
    tone: averageRecovery >= 60 ? "success" : "warning",
    summary: `Converts confusion spikes in ${topic} into a timed recovery plan instead of waiting for the end-of-class summary.`,
    detail:
      "The recovery engine learns which intervention styles actually move confusion down and turns that evidence into a next-step protocol.",
    metrics: [
      buildMetric("Avg recovery", formatPercent(averageRecovery)),
      buildMetric("Best intervention", formatInterventionType(bestIntervention?.type)),
      buildMetric("Unresolved signals", String(unresolvedSignals)),
    ],
    sections: [
      {
        title: "Recovery triggers",
        items: [
          `Treat ${riskWindow} as a live checkpoint, not a passive observation window.`,
          `Intervene once confusion pressure approaches ${formatPercent(recoveryTrigger)} instead of waiting for mistakes to multiply.`,
          `${formatReasonChip(dominantReason)} should trigger the first repair move, because that signal has repeated most often.`,
        ],
      },
      {
        title: "Recovery stack",
        items:
          interventionLines.length > 0
            ? interventionLines
            : [
                "Board walkthrough for the first corrected example.",
                "Bilingual explanation if the room is translating the question before solving it.",
                "Fast poll to see whether repair really landed.",
              ],
      },
      {
        title: "Tomorrow's repair plan",
        items: [
          latestSummary?.suggestedNextActivity ??
            `Begin the next class with a short recap of ${topic} before introducing new material.`,
          "Measure recovery again after the first intervention rather than assuming the room is ready.",
          "End with one transfer question so repaired understanding is tested in a fresh context.",
        ],
      },
    ],
    recommendedAction: `Deploy ${formatInterventionType(bestIntervention?.type)} within the first minute of the next wobble instead of waiting until students are fully lost.`,
  } satisfies IntelligenceFeature;
}

function buildPeerLearningFeature(args: {
  latestSummary?: SessionSummaryPayload;
  preferences: Partial<TeacherPreferences>;
  dominantReason: ReasonChip;
}) {
  const { latestSummary, preferences, dominantReason } = args;
  const topic = getLatestTopicHandle(latestSummary, preferences);
  const dominantPoll = latestSummary?.dominantPollInsight;
  const mixedReadiness = (dominantPoll?.leadingOptionPercent ?? 0) < 55;
  const groupModel = mixedReadiness ? "Trios with anchor / checker / summarizer" : "Structured pairs";
  const readinessSignal = dominantPoll
    ? `${dominantPoll.leadingOptionText} (${formatPercent(dominantPoll.leadingOptionPercent)})`
    : "No recent poll signal";

  return {
    key: "peer_learning_orchestrator",
    category: "recovery",
    name: "Peer Learning Orchestrator",
    statusLabel: "Group protocol ready",
    tone: "primary",
    summary: `Designs peer learning moves for ${topic} so partial understanding becomes visible, coachable, and shared.`,
    detail:
      "Rather than generic pair-work, the orchestrator assigns roles, talk moves, and monitoring cues based on the dominant confusion pattern.",
    metrics: [
      buildMetric("Group model", groupModel),
      buildMetric("Readiness signal", readinessSignal),
      buildMetric("Target pattern", formatReasonChip(dominantReason)),
    ],
    sections: [
      {
        title: "Recommended grouping model",
        items: [
          `${groupModel} is the best fit for the latest readiness mix.`,
          "Start with one student who can explain the first move, not necessarily the full solution.",
          "Rotate the explainer role after the first checkpoint so quiet understanding still surfaces.",
        ],
      },
      {
        title: "Peer roles",
        items: buildPeerRoles(dominantReason),
      },
      {
        title: "What the teacher should monitor",
        items: [
          `Listen for whether students can explain ${topic} without immediately asking for confirmation.`,
          "Step in when one student is doing all the talking and the checker role disappears.",
          "End the peer burst with a whole-class shareback so fragile understanding becomes public and repairable.",
        ],
      },
    ],
    recommendedAction: `Use ${groupModel.toLowerCase()} right after the first modeled example so students rehearse reasoning before independent practice begins.`,
  } satisfies IntelligenceFeature;
}

function buildExplanationAdaptationFeature(args: {
  latestSummary?: SessionSummaryPayload;
  preferences: Partial<TeacherPreferences>;
  dominantReason: ReasonChip;
  language: string;
}) {
  const { latestSummary, preferences, dominantReason, language } = args;
  const topic = getLatestTopicHandle(latestSummary, preferences);
  const defaultStyle = getExplanationDefault(dominantReason);
  const backupStyle = getExplanationBackup(dominantReason);

  return {
    key: "explanation_style_adaptation",
    category: "recovery",
    name: "Explanation Style Adaptation",
    statusLabel: "Adaptive",
    tone: "success",
    summary: `Adapts the explanation of ${topic} to the kind of confusion students are actually showing, instead of repeating the same script louder.`,
    detail:
      "Each style switch is anchored to a classroom signal: steps, language, notation, pace, or missing prerequisite knowledge.",
    metrics: [
      buildMetric("Default style", defaultStyle),
      buildMetric("Backup style", backupStyle),
      buildMetric("Language mode", language),
    ],
    sections: [
      {
        title: "Suggested explanation sequence",
        items: [
          `Start with ${defaultStyle} because ${formatReasonChip(dominantReason).toLowerCase()} is leading right now.`,
          `If repair is still weak, switch immediately to ${backupStyle} instead of repeating the original wording.`,
          "Close with a student paraphrase so the room proves understanding in learner language, not only teacher language.",
        ],
      },
      {
        title: "Styles ready to deploy",
        items: [
          "Direct explanation: the shortest clear statement of the idea.",
          "Worked example: one clean model with the decision points named aloud.",
          "Analogy: a memory hook when the concept is abstract but the logic is sound.",
          `Bilingual bridge: restate the idea in ${language} first, then reconnect it to the formal classroom term.`,
        ],
      },
      {
        title: "Switch styles when you hear",
        items: [
          "\"I don't know what the question wants\" -> move to plain-language or bilingual bridge.",
          "\"I knew it a minute ago but lost the method\" -> move to worked-example first.",
          "\"I don't know what this symbol means\" -> move to symbol-by-symbol unpack.",
        ],
      },
    ],
    recommendedAction: `Lead with ${defaultStyle} on the next reteach and switch to ${backupStyle} the moment confusion stays sticky.`,
  } satisfies IntelligenceFeature;
}

function buildTeacherGrowthFeature(args: {
  summaries: SessionSummaryPayload[];
  latestSummary?: SessionSummaryPayload;
  weeklyInsight: WeeklyInsightPayload | null;
}) {
  const { summaries, latestSummary, weeklyInsight } = args;
  const coaching = weeklyInsight?.coaching;
  const voiceActions = latestSummary?.voiceReflectionActions.slice(0, 3) ?? [];
  const bestIntervention = getBestInterventionTrend(weeklyInsight, latestSummary);

  return {
    key: "teacher_growth_copilot",
    category: "growth",
    name: "Teacher Growth Copilot",
    statusLabel: coaching ? "Coaching live" : "Coaching baseline",
    tone: coaching ? "info" : "neutral",
    summary: "Turns saved session evidence into a weekly coaching loop for the teacher, not just a static analytics report.",
    detail:
      "The copilot synthesizes difficulty hotspots, intervention quality, and reflection notes into a short list of habits worth practicing next.",
    metrics: [
      buildMetric("Sessions reviewed", String(summaries.length)),
      buildMetric("Hardest slot", coaching?.worstTimeSlot ?? "Still learning"),
      buildMetric("Strongest move", formatInterventionType(bestIntervention?.type)),
    ],
    sections: [
      {
        title: "This week's coaching readout",
        items: [
          coaching?.narrative ??
            "Weekly coaching gets sharper as more session summaries accumulate.",
          `Most difficult topic: ${coaching?.mostDifficultTopic ?? "Not enough sessions yet"}.`,
          `Best intervention style so far: ${coaching?.bestInterventionStyle ?? "Not enough interventions yet"}.`,
        ],
      },
      {
        title: "Next habits to practice",
        items:
          coaching?.revisionPriorities?.length
            ? coaching.revisionPriorities
            : [
                "Open with a shorter recap before introducing fresh content.",
                "Check understanding after the first step instead of waiting for practice to fail.",
                "Log the next recurring misconception so it becomes coachable next week.",
              ],
      },
      {
        title: "Reflection cues from recent sessions",
        items:
          voiceActions.length > 0
            ? voiceActions.map((action) => `${action.title} · ${action.detail}`)
            : [
                "Capture one short voice reflection after class while the signal is still fresh.",
                "Name the moment where the class first drifted, not only the final outcome.",
                "Choose one habit to improve next class rather than rewriting the whole lesson.",
              ],
      },
    ],
    recommendedAction:
      coaching?.revisionPriorities?.[0] ??
      "Choose one habit for the next lesson and measure whether the change actually improves recovery.",
  } satisfies IntelligenceFeature;
}

function buildEquityLensFeature(args: {
  summaries: SessionSummaryPayload[];
  weeklyInsight: WeeklyInsightPayload | null;
  preferences: Partial<TeacherPreferences>;
  dominantReason: ReasonChip;
}) {
  const { summaries, weeklyInsight, preferences, dominantReason } = args;
  const language = formatLanguage(preferences.defaultLanguage);
  const languageFrictionSessions = getLanguageFrictionSessionCount(summaries);
  const missingPrerequisiteSessions = getMissingPrerequisiteSessionCount(summaries);
  const pacePressureSessions = getPacePressureSessionCount(summaries);
  const languageFrictionRate = Math.round(
    weeklyInsight?.languageFrictionTrend?.reduce((sum, point) => sum + point.frictionRate, 0) ??
      0
  );
  const equityRiskScore = clamp(
    18 +
      languageFrictionSessions * 11 +
      missingPrerequisiteSessions * 9 +
      pacePressureSessions * 7 +
      languageFrictionRate * 0.25,
    12,
    96
  );

  return {
    key: "learning_equity_lens",
    category: "growth",
    name: "Learning Equity Lens",
    statusLabel: equityRiskScore >= 60 ? "Equity watch" : "Equity scan",
    tone: equityRiskScore >= 60 ? "warning" : "info",
    summary: "Surfaces the learners who can disappear behind pace, language load, or missing prerequisites even when the room looks generally on task.",
    detail:
      "The equity lens does not guess demographics. It watches for classroom signals that often hide access barriers and frames them as design issues the teacher can respond to.",
    metrics: [
      buildMetric("Equity risk", formatPercent(equityRiskScore)),
      buildMetric("Language friction sessions", String(languageFrictionSessions)),
      buildMetric("Prerequisite flags", String(missingPrerequisiteSessions)),
    ],
    sections: [
      {
        title: "Signals that can hide learning loss",
        items: [
          `${languageFrictionSessions} recent session${languageFrictionSessions === 1 ? "" : "s"} carried language friction as a top reason chip.`,
          `${missingPrerequisiteSessions} session${missingPrerequisiteSessions === 1 ? "" : "s"} showed missing prerequisite knowledge rather than simple inattention.`,
          `${pacePressureSessions} session${pacePressureSessions === 1 ? "" : "s"} flagged pace pressure, which can mask confusion until independent work begins.`,
        ],
      },
      {
        title: "Where access may be breaking",
        items: [
          `Students may be translating the question into ${language} before they can even begin solving.`,
          "Students who missed one earlier concept may look disengaged when the real issue is an unrebuilt foundation.",
          `When ${formatReasonChip(dominantReason).toLowerCase()} appears, treat it as an access design problem first, not a motivation problem.`,
        ],
      },
      {
        title: "Moves that widen access",
        items: [
          "Pre-teach vocabulary and ask for a student paraphrase before formal explanation.",
          "Name the prerequisite explicitly and rebuild it in one minute before new practice.",
          "Insert silent think time after the first modeled step so slower processors can join before the room races ahead.",
        ],
      },
    ],
    recommendedAction:
      "Treat the next friction spike as a signal to widen access with language, prerequisite, or pacing support before assigning more practice.",
  } satisfies IntelligenceFeature;
}

export function buildIntelligenceDashboard({
  summaries,
  weeklyInsight,
  preferences,
}: BuildIntelligenceDashboardOptions): IntelligenceDashboard {
  const recentSummaries = summaries.slice(0, 12);
  const latestSummary = recentSummaries[0];
  const summariesAnalyzed = recentSummaries.length;
  const dominantReason =
    latestSummary?.topReasonChips[0]?.chip ?? getDominantReasonChip(recentSummaries);
  const averageRecovery = getAverageRecovery(recentSummaries);
  const averagePeakConfusion = getAveragePeakConfusion(recentSummaries);
  const language = formatLanguage(preferences.defaultLanguage);
  const topic = getLatestTopicHandle(latestSummary, preferences);
  const subject = getLatestSubjectHandle(latestSummary, preferences);
  const recurringCount =
    weeklyInsight?.recurringMisconceptions.length ?? latestSummary?.topClusters.length ?? 0;
  const headline = latestSummary
    ? `${subject} intelligence workspace for ${topic}`
    : "AI intelligence workspace";
  const summary =
    weeklyInsight?.coaching?.narrative ??
    latestSummary?.aiNarrativeSummary ??
    `As new sessions land, this workspace will synthesize classroom signals for ${subject}, recovery planning, and teacher coaching.`;

  return {
    generatedAt: new Date().toISOString(),
    headline,
    summary,
    dataCoverageLabel:
      summariesAnalyzed > 0
        ? `Using ${summariesAnalyzed} recent session summary${summariesAnalyzed === 1 ? "" : "ies"} and ${weeklyInsight?.totalSessions ?? 0} weekly signal${weeklyInsight?.totalSessions === 1 ? "" : "s"}.`
        : "Waiting for session evidence to accumulate. Feature blueprints are ready with baseline defaults.",
    metrics: [
      buildMetric("Summaries", String(summariesAnalyzed)),
      buildMetric("Avg recovery", formatPercent(averageRecovery)),
      buildMetric("Top signal", formatReasonChip(dominantReason)),
      buildMetric("Recurring misconceptions", String(recurringCount)),
    ],
    features: [
      buildClassroomTwinFeature({
        latestSummary,
        weeklyInsight,
        preferences,
        dominantReason,
        averageRecovery,
        averagePeakConfusion,
        summariesAnalyzed,
      }),
      buildMisconceptionForecastingFeature({
        latestSummary,
        weeklyInsight,
        preferences,
        dominantReason,
        summariesAnalyzed,
        language,
      }),
      buildSocraticGeneratorFeature({
        latestSummary,
        preferences,
        dominantReason,
      }),
      buildLessonRebuilderFeature({
        latestSummary,
        preferences,
        dominantReason,
        language,
      }),
      buildRecoveryEngineFeature({
        latestSummary,
        weeklyInsight,
        preferences,
        dominantReason,
        averageRecovery,
      }),
      buildPeerLearningFeature({
        latestSummary,
        preferences,
        dominantReason,
      }),
      buildExplanationAdaptationFeature({
        latestSummary,
        preferences,
        dominantReason,
        language,
      }),
      buildTeacherGrowthFeature({
        summaries: recentSummaries,
        latestSummary,
        weeklyInsight,
      }),
      buildEquityLensFeature({
        summaries: recentSummaries,
        weeklyInsight,
        preferences,
        dominantReason,
      }),
    ],
  };
}
