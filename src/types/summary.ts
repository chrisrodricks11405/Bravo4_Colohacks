import { ConfusionTrendPoint } from "./pulse";
import { MisconceptionClusterSummary, ReasonChip } from "./question";
import { InterventionActionPayload } from "./intervention";
import { LessonMarker } from "./lesson";
import {
  AIWeeklyCoaching,
  VoiceReflectionAction,
} from "./ai";

/** Session summary generated at end of class */
export interface SessionSummaryPayload {
  id: string;
  sessionId: string;
  teacherId?: string;
  subject: string;
  topic: string;
  gradeClass: string;
  duration: number;
  totalParticipants: number;
  comprehensionTimeline: ConfusionTrendPoint[];
  peakConfusionMoments: PeakMoment[];
  topClusters: MisconceptionClusterSummary[];
  topReasonChips: ReasonChipCount[];
  lessonMarkers: LessonMarker[];
  interventions: InterventionActionPayload[];
  interventionStats: InterventionEffectiveness[];
  dominantPollInsight?: PollSummaryInsight;
  peakConfusionIndex: number;
  endingConfusionIndex: number;
  peakLostPercent: number;
  endingLostPercent: number;
  overallRecoveryScore: number;
  aiNarrativeSummary?: string;
  suggestedNextActivity?: string;
  voiceReflectionUri?: string;
  voiceReflectionTranscript?: string;
  voiceReflectionSummary?: string;
  voiceReflectionActions: VoiceReflectionAction[];
  voiceReflectionActionSource?: "edge" | "fallback";
  summarySource: "edge" | "fallback";
  synced?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PeakMoment {
  timestamp: string;
  confusionIndex: number;
  lostPercent?: number;
  label?: string;
}

export interface ReasonChipCount {
  chip: ReasonChip;
  count: number;
}

export interface InterventionEffectiveness {
  type: InterventionActionPayload["type"];
  count: number;
  avgRecoveryScore?: number;
  successfulCount: number;
  unresolvedCount: number;
}

export interface PollSummaryInsight {
  pollId: string;
  question: string;
  leadingOptionText: string;
  leadingOptionPercent: number;
  totalResponses: number;
}

/** Weekly insight payload for teaching patterns */
export type WeeklyRangePreset = "this_week" | "last_week" | "custom";

export interface WeeklyDateRange {
  preset: WeeklyRangePreset;
  startDate: string;
  endDate: string;
  startAt: string;
  endExclusiveAt: string;
  label: string;
}

export interface WeeklyTopicDifficultyCell {
  key: string;
  subject: string;
  topic: string;
  avgDifficultyScore: number;
  avgPeakConfusionIndex: number;
  avgEndingConfusionIndex: number;
  avgRecoveryScore: number;
  sessionCount: number;
}

export interface WeeklyHeatmapCell {
  key: string;
  dayKey: string;
  dayLabel: string;
  slotKey: string;
  slotLabel: string;
  avgConfusionIndex: number;
  avgRecoveryScore: number;
  sessionCount: number;
}

export interface WeeklyRecurringMisconception {
  key: string;
  title: string;
  frequency: number;
  totalAffectedStudents: number;
  subjects: string[];
  dominantReasonChip: ReasonChip;
}

export interface WeeklyInterventionTrend {
  type: InterventionActionPayload["type"];
  usageCount: number;
  avgRecoveryScore: number;
  successfulCount: number;
  trendDelta: number;
  trendDirection: "up" | "down" | "stable";
}

export interface WeeklyLanguageFrictionPoint {
  date: string;
  label: string;
  sessionCount: number;
  frictionSessionCount: number;
  frictionRate: number;
}

export interface WeeklySubjectComprehension {
  subject: string;
  avgComprehensionScore: number;
  avgRecoveryScore: number;
  sessionCount: number;
}

export interface WeeklyInsightAggregate {
  cacheKey: string;
  teacherId: string;
  range: WeeklyDateRange;
  generatedAt: string;
  totalSessions: number;
  averageParticipants: number;
  averageRecoveryScore: number;
  averageConfusionIndex: number;
  topicDifficultyHeatmap: WeeklyTopicDifficultyCell[];
  classPeriodConfusionHeatmap: WeeklyHeatmapCell[];
  recurringMisconceptions: WeeklyRecurringMisconception[];
  interventionEffectivenessTrends: WeeklyInterventionTrend[];
  languageFrictionTrend: WeeklyLanguageFrictionPoint[];
  subjectComprehension: WeeklySubjectComprehension[];
}

export interface WeeklyInsightPayload extends WeeklyInsightAggregate {
  coaching: AIWeeklyCoaching;
}
