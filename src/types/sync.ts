/** Pending sync job stored in local SQLite */
export interface SyncJob {
  id: string;
  type: SyncJobType;
  payload: string;
  sessionId?: string;
  jobKey?: string;
  status: SyncJobStatus;
  retryCount: number;
  createdAt: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  completedAt?: string;
  error?: string;
}

export type SyncJobType =
  | "session_create"
  | "session_update"
  | "pulse_batch"
  | "question_batch"
  | "cluster_update"
  | "intervention"
  | "poll_create"
  | "poll_result"
  | "summary"
  | "lesson_marker";

export type SyncJobStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface SyncQueueOverview {
  localQueueCount: number;
  pendingJobs: number;
  failedJobs: number;
  inProgressJobs: number;
  completedJobs: number;
  lastSyncAt: string | null;
  nextRetryAt: string | null;
}

export interface SyncRunSnapshot {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  progress: number;
  activeJobLabel?: string;
}
