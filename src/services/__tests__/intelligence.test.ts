import { buildIntelligenceDashboard } from "../intelligence";
import type { SessionSummaryPayload, WeeklyInsightPayload } from "../../types";

const summary: SessionSummaryPayload = {
  id: "summary_1",
  sessionId: "session_1",
  teacherId: "teacher_1",
  subject: "Mathematics",
  topic: "Fractions",
  gradeClass: "Class 7",
  duration: 2_400_000,
  totalParticipants: 36,
  comprehensionTimeline: [],
  peakConfusionMoments: [
    {
      timestamp: "2026-03-28T08:16:00.000Z",
      confusionIndex: 71,
      lostPercent: 48,
      label: "after the first worked example",
    },
  ],
  topClusters: [
    {
      id: "cluster_1",
      sessionId: "session_1",
      title: "Questions about equivalent fractions",
      summary: "Students can start the method but lose the scaling logic.",
      affectedCount: 14,
      representativeQuestion: "Why do both numerator and denominator change together?",
      reasonChip: "step_unclear",
      translation: "Dono ko ek saath kyu multiply karte hain?",
      keywordAnchors: ["equivalent", "scale"],
      latestQuestionAt: "2026-03-28T08:16:00.000Z",
      source: "fallback",
      status: "active",
      suggestedInterventions: ["board_script", "quick_poll"],
      createdAt: "2026-03-28T08:15:00.000Z",
      updatedAt: "2026-03-28T08:17:00.000Z",
    },
  ],
  topReasonChips: [
    { chip: "step_unclear", count: 12 },
    { chip: "language_friction", count: 5 },
  ],
  lessonMarkers: [],
  interventions: [],
  interventionStats: [
    {
      type: "board_script",
      count: 3,
      avgRecoveryScore: 24,
      successfulCount: 2,
      unresolvedCount: 1,
    },
    {
      type: "bilingual_explanation",
      count: 1,
      avgRecoveryScore: 18,
      successfulCount: 1,
      unresolvedCount: 0,
    },
  ],
  dominantPollInsight: {
    pollId: "poll_1",
    question: "Which statement matches your understanding?",
    leadingOptionText: "I know the first step but not the full method.",
    leadingOptionPercent: 44,
    totalResponses: 28,
  },
  peakConfusionIndex: 71,
  endingConfusionIndex: 34,
  peakLostPercent: 48,
  endingLostPercent: 19,
  overallRecoveryScore: 68,
  aiNarrativeSummary:
    "Confusion peaked after the first worked example and dropped once the method was rewritten step by step.",
  suggestedNextActivity:
    "Open with one equivalent-fractions example broken into numbered steps.",
  voiceReflectionSummary: "Students improved after the board walkthrough slowed the pace.",
  voiceReflectionActions: [
    {
      id: "action_1",
      title: "Slow the opener",
      detail: "Reopen fractions with a slower first example and a pause before answers.",
      timing: "opening",
    },
  ],
  voiceReflectionActionSource: "fallback",
  summarySource: "fallback",
  synced: true,
  createdAt: "2026-03-28T09:00:00.000Z",
  updatedAt: "2026-03-28T09:10:00.000Z",
};

const weeklyInsight: WeeklyInsightPayload = {
  cacheKey: "teacher_1:this_week:2026-03-23:2026-03-29",
  teacherId: "teacher_1",
  range: {
    preset: "this_week",
    startDate: "2026-03-23",
    endDate: "2026-03-29",
    startAt: "2026-03-23T00:00:00.000Z",
    endExclusiveAt: "2026-03-30T00:00:00.000Z",
    label: "Mar 23 - Mar 29",
  },
  generatedAt: "2026-03-29T08:00:00.000Z",
  totalSessions: 4,
  averageParticipants: 34,
  averageRecoveryScore: 62,
  averageConfusionIndex: 58,
  topicDifficultyHeatmap: [
    {
      key: "math:fractions",
      subject: "Mathematics",
      topic: "Fractions",
      avgDifficultyScore: 67,
      avgPeakConfusionIndex: 71,
      avgEndingConfusionIndex: 33,
      avgRecoveryScore: 62,
      sessionCount: 4,
    },
  ],
  classPeriodConfusionHeatmap: [
    {
      key: "thu_late_morning",
      dayKey: "thu",
      dayLabel: "Thu",
      slotKey: "late_morning",
      slotLabel: "Late Morning",
      avgConfusionIndex: 66,
      avgRecoveryScore: 59,
      sessionCount: 2,
    },
  ],
  recurringMisconceptions: [
    {
      key: "equivalent_fractions",
      title: "Questions about equivalent fractions",
      frequency: 3,
      totalAffectedStudents: 30,
      subjects: ["Mathematics"],
      dominantReasonChip: "step_unclear",
    },
  ],
  interventionEffectivenessTrends: [
    {
      type: "board_script",
      usageCount: 5,
      avgRecoveryScore: 23,
      successfulCount: 4,
      trendDelta: 4,
      trendDirection: "up",
    },
  ],
  languageFrictionTrend: [
    {
      date: "2026-03-27",
      label: "Fri",
      sessionCount: 2,
      frictionSessionCount: 1,
      frictionRate: 50,
    },
  ],
  subjectComprehension: [
    {
      subject: "Mathematics",
      avgComprehensionScore: 64,
      avgRecoveryScore: 62,
      sessionCount: 4,
    },
  ],
  coaching: {
    mostDifficultTopic: "Fractions (Mathematics)",
    worstTimeSlot: "Thu Late Morning",
    bestInterventionStyle: "board walkthrough",
    revisionPriorities: [
      "Revisit fractions with a slower worked example before new practice.",
      "Pre-teach scaling language before asking students to compare fractions.",
    ],
    narrative:
      "Across 4 sessions, fractions created the heaviest strain while late-morning classes showed the highest confusion signal.",
  },
};

describe("buildIntelligenceDashboard", () => {
  it("creates detailed feature cards for all requested capabilities", () => {
    const dashboard = buildIntelligenceDashboard({
      summaries: [summary],
      weeklyInsight,
      preferences: {
        defaultLanguage: "English",
        defaultSubject: "Mathematics",
        defaultGradeClass: "Class 7",
      },
    });

    expect(dashboard.features).toHaveLength(9);
    expect(dashboard.headline).toContain("Mathematics");
    expect(dashboard.summary).toContain("fractions");

    const classroomTwin = dashboard.features.find(
      (feature) => feature.key === "ai_classroom_twin"
    );
    expect(classroomTwin?.metrics[0].label).toBe("Twin confidence");
    expect(classroomTwin?.recommendedAction).toContain("numbered steps");

    const socratic = dashboard.features.find(
      (feature) => feature.key === "ai_socratic_question_generator"
    );
    expect(socratic?.sections[0].items).toHaveLength(4);
    expect(socratic?.sections[0].items[0]).toContain("first thing");

    const equityLens = dashboard.features.find(
      (feature) => feature.key === "learning_equity_lens"
    );
    expect(equityLens?.statusLabel).toBe("Equity scan");
    expect(equityLens?.metrics[1].value).toBe("1");
  });
});
