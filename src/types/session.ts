/** Session creation payload sent to Supabase */
export interface SessionCreatePayload {
  subject: string;
  topic: string;
  gradeClass: string;
  language: string;
  lostThreshold: number;
  mode: "online" | "offline";
  lessonPlanSeed?: string;
}

/** Full session metadata returned from server / stored locally */
export interface SessionMeta {
  id: string;
  teacherId: string;
  joinCode: string;
  qrPayload: string;
  subject: string;
  topic: string;
  gradeClass: string;
  language: string;
  lostThreshold: number;
  mode: "online" | "offline";
  lessonPlanSeed?: string;
  status: SessionStatus;
  participantCount: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  lockedAt?: string;
}

export type SessionStatus =
  | "lobby"
  | "active"
  | "paused"
  | "ended";
