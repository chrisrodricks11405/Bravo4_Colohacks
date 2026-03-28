/** Pulse signal values students can send */
export type PulseValue = "got_it" | "sort_of" | "lost";

/** Individual pulse event from a student (anonymous on teacher side) */
export interface PulseSignalEvent {
  sessionId: string;
  anonymousId: string;
  pulse: PulseValue;
  timestamp: string;
}

/** Aggregated pulse snapshot for the teacher dashboard */
export interface PulseAggregateSnapshot {
  sessionId: string;
  timestamp: string;
  gotItCount: number;
  sortOfCount: number;
  lostCount: number;
  totalActive: number;
  disconnectedCount: number;
  confusionIndex: number;
}

/** A single point on the confusion trend timeline */
export interface ConfusionTrendPoint {
  timestamp: string;
  confusionIndex: number;
  lostPercent: number;
  hasInterventionMarker: boolean;
  interventionId?: string;
}
