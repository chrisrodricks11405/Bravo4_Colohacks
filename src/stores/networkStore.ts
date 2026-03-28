import { create } from "zustand";

export type NetworkMode = "online" | "offline" | "local_hotspot";
export type ConnectionQuality = "good" | "fair" | "poor" | "none";

interface NetworkState {
  isConnected: boolean;
  mode: NetworkMode;
  connectionQuality: ConnectionQuality;
  lastOnlineAt: string | null;
  supabaseReachable: boolean;
  aiProviderReachable: boolean;
  voiceServiceReachable: boolean;
  pendingSyncCount: number;
  failedSyncCount: number;
  localQueueCount: number;
  syncInProgress: boolean;
  syncProgress: number;
  syncCompletedJobs: number;
  syncTotalJobs: number;
  syncMessage: string | null;
  lastSyncAt: string | null;
  nextRetryAt: string | null;

  setConnected: (connected: boolean) => void;
  setMode: (mode: NetworkMode) => void;
  setConnectionQuality: (quality: ConnectionQuality) => void;
  setSupabaseReachable: (reachable: boolean) => void;
  setAIProviderReachable: (reachable: boolean) => void;
  setVoiceServiceReachable: (reachable: boolean) => void;
  setPendingSyncCount: (count: number) => void;
  setSyncOverview: (overview: Partial<Pick<
    NetworkState,
    | "pendingSyncCount"
    | "failedSyncCount"
    | "localQueueCount"
    | "lastSyncAt"
    | "nextRetryAt"
  >>) => void;
  beginSync: (totalJobs: number, message?: string | null) => void;
  updateSyncProgress: (completedJobs: number, totalJobs: number, message?: string | null) => void;
  finishSync: (args?: {
    completedJobs?: number;
    totalJobs?: number;
    message?: string | null;
    lastSyncAt?: string | null;
  }) => void;
  updateLastOnline: () => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isConnected: true,
  mode: "online",
  connectionQuality: "good",
  lastOnlineAt: null,
  supabaseReachable: false,
  aiProviderReachable: false,
  voiceServiceReachable: false,
  pendingSyncCount: 0,
  failedSyncCount: 0,
  localQueueCount: 0,
  syncInProgress: false,
  syncProgress: 0,
  syncCompletedJobs: 0,
  syncTotalJobs: 0,
  syncMessage: null,
  lastSyncAt: null,
  nextRetryAt: null,

  setConnected: (connected) =>
    set((state) => ({
      isConnected: connected,
      lastOnlineAt: connected ? new Date().toISOString() : state.lastOnlineAt,
    })),

  setMode: (mode) => set({ mode }),
  setConnectionQuality: (quality) => set({ connectionQuality: quality }),
  setSupabaseReachable: (reachable) => set({ supabaseReachable: reachable }),
  setAIProviderReachable: (reachable) => set({ aiProviderReachable: reachable }),
  setVoiceServiceReachable: (reachable) => set({ voiceServiceReachable: reachable }),
  setPendingSyncCount: (count) => set({ pendingSyncCount: count }),
  setSyncOverview: (overview) => set(overview),
  beginSync: (totalJobs, message = null) =>
    set({
      syncInProgress: totalJobs > 0,
      syncProgress: totalJobs > 0 ? 0 : 100,
      syncCompletedJobs: 0,
      syncTotalJobs: totalJobs,
      syncMessage: message,
    }),
  updateSyncProgress: (completedJobs, totalJobs, message = null) =>
    set({
      syncInProgress: totalJobs > 0 && completedJobs < totalJobs,
      syncCompletedJobs: completedJobs,
      syncTotalJobs: totalJobs,
      syncProgress: totalJobs <= 0 ? 100 : Math.min(100, Math.round((completedJobs / totalJobs) * 100)),
      syncMessage: message,
    }),
  finishSync: (args) =>
    set((state) => ({
      syncInProgress: false,
      syncCompletedJobs: args?.completedJobs ?? state.syncCompletedJobs,
      syncTotalJobs: args?.totalJobs ?? state.syncTotalJobs,
      syncProgress:
        args?.totalJobs && args.totalJobs > 0
          ? 100
          : state.syncTotalJobs > 0
            ? 100
            : state.syncProgress,
      syncMessage: args?.message ?? null,
      lastSyncAt: args?.lastSyncAt ?? state.lastSyncAt,
    })),

  updateLastOnline: () =>
    set({ lastOnlineAt: new Date().toISOString() }),
}));
