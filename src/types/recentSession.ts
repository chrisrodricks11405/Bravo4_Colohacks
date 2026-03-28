export interface RecentSession {
  id: string;
  subject: string;
  topic: string;
  gradeClass: string;
  status: string;
  participantCount: number;
  createdAt: string;
  endedAt?: string | null;
  confusionIndexAvg?: number | null;
  synced: boolean;
}

export interface RecentSessionSyncResult {
  syncedCount: number;
  syncedAt: string | null;
  source: "local" | "supabase";
}
