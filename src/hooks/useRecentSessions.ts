import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { hasSupabaseConfig } from "../lib/supabase";
import { useAuth } from "../providers";
import {
  countPendingSyncJobs,
  listRecentSessions,
  syncRecentSessionsFromSupabase,
} from "../services";
import { useNetworkStore } from "../stores";
import type { RecentSession } from "../types";

interface UseRecentSessionsOptions {
  limit?: number;
  autoSync?: boolean;
}

export function useRecentSessions({
  limit = 12,
  autoSync = true,
}: UseRecentSessionsOptions = {}) {
  const { user } = useAuth();
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);
  const setPendingSyncCount = useNetworkStore((state) => state.setPendingSyncCount);
  const setSupabaseReachable = useNetworkStore((state) => state.setSupabaseReachable);

  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const hasCompletedInitialRefreshRef = useRef(false);

  const loadLocalState = async () => {
    const [localSessions, pendingJobs] = await Promise.all([
      listRecentSessions(limit),
      countPendingSyncJobs(),
    ]);

    startTransition(() => {
      setSessions(localSessions);
    });
    setPendingSyncCount(pendingJobs);
  };

  const refresh = async (mode: "initial" | "focus" | "pull" = "pull") => {
    const showBlockingState = mode === "initial" && sessions.length === 0;

    if (showBlockingState) {
      setIsLoading(true);
    }

    if (mode === "pull") {
      setIsRefreshing(true);
    }

    try {
      await loadLocalState();
      setSyncError(null);

      if (autoSync && supabaseReachable && user?.id && hasSupabaseConfig) {
        setIsSyncing(true);
        const syncResult = await syncRecentSessionsFromSupabase(user.id, limit);
        setLastSyncedAt(syncResult.syncedAt);
        setSupabaseReachable(true);
        await loadLocalState();
      } else if (!hasSupabaseConfig) {
        setSupabaseReachable(false);
      }
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Unable to refresh recent sessions."
      );
      setSupabaseReachable(false);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsSyncing(false);
      if (mode === "initial") {
        hasCompletedInitialRefreshRef.current = true;
      }
    }
  };

  useEffect(() => {
    void refresh("initial");
  }, [user?.id, supabaseReachable, limit, autoSync]);

  useFocusEffect(
    useCallback(() => {
      if (!hasCompletedInitialRefreshRef.current) {
        return undefined;
      }

      void refresh("focus");
      return undefined;
    }, [user?.id, supabaseReachable, limit, autoSync])
  );

  return {
    sessions,
    isLoading,
    isRefreshing,
    isSyncing,
    lastSyncedAt,
    syncError,
    refresh,
  };
}
