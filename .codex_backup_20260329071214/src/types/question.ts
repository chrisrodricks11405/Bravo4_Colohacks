/** Anonymous student question payload */
export interface AnonymousQuestionPayload {
  id: string;
  sessionId: string;
  anonymousId: string;
  text: string;
  language?: string;
  lessonMarkerId?: string;
  timestamp: string;
}

/** AI-generated cluster of similar student questions */
export interface MisconceptionClusterSummary {
  id: string;
  sessionId: string;
  title: string;
  summary: string;
  affectedCount: number;
  representativeQuestion: string;
  reasonChip: ReasonChip;
  lessonMarkerId?: string;
  translation?: string;
  keywordAnchors?: string[];
  latestQuestionAt?: string;
  source?: ClusterSource;
  status: ClusterStatus;
  suggestedInterventions: string[];
  createdAt: string;
  updatedAt: string;
}

export type ReasonChip =
  | "step_unclear"
  | "language_friction"
  | "missing_prerequisite"
  | "too_fast"
  | "notation_confusion"
  | "example_needed"
  | "other";

export type ClusterStatus =
  | "active"
  | "acknowledged"
  | "resolved"
  | "dismissed";

export type ClusterSource = "ai" | "fallback";
