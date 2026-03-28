/** Quick poll sent to students */
export interface QuickPollPayload {
  id: string;
  sessionId: string;
  question: string;
  options: PollOption[];
  correctOptionIndex?: number;
  source: "manual" | "ai_generated";
  clusterId?: string;
  clusterTitle?: string;
  rationale?: string;
  status: PollStatus;
  createdAt: string;
  updatedAt: string;
  pushedAt?: string;
  closedAt?: string;
}

export interface PollOption {
  index: number;
  text: string;
}

export interface QuickPollDraftInput {
  question: string;
  options: string[];
  correctOptionIndex?: number;
  source: "manual" | "ai_generated";
  clusterId?: string;
  clusterTitle?: string;
  rationale?: string;
}

export type PollStatus = "draft" | "active" | "closed";

export interface PollResponsePayload {
  id: string;
  pollId: string;
  sessionId: string;
  anonymousId: string;
  optionIndex: number;
  submittedAt: string;
}

/** Live distribution of poll responses */
export interface PollDistributionSnapshot {
  pollId: string;
  sessionId: string;
  timestamp: string;
  totalResponses: number;
  distribution: PollOptionCount[];
  leadingOptionIndex?: number;
}

export interface PollOptionCount {
  optionIndex: number;
  count: number;
  percent: number;
}
