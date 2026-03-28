/** Intervention action taken by the teacher */
export interface InterventionActionPayload {
  id: string;
  sessionId: string;
  type: InterventionType;
  clusterId?: string;
  lessonMarkerId?: string;
  timestamp: string;
  confusionBefore: number;
  confusionAfter?: number;
  recoveryScore?: number;
  recoveryWindowSeconds: number;
  durationSeconds?: number;
  notes?: string;
}

export type InterventionType =
  | "reteach"
  | "example"
  | "poll"
  | "language_switch"
  | "pause"
  | "analogy"
  | "bilingual_explanation"
  | "board_script"
  | "other";
