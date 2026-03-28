import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { hasSupabaseConfig } from "../lib/supabase";
import { useAuth } from "../providers";
import { listSessionSummaries, syncSessionSummariesFromSupabase } from "../services";
import { useNetworkStore } from "../stores";
import type { SessionSummaryPayload } from "../types";

interface UseSessionSummariesOptions {
  limit?: number;
  autoSync?: boolean;
  query?: string;
}

export function useSessionSummaries({
  limit = 24,
  autoSync = true,
  query = "",
}: UseSessionSummariesOptions = {}) {
  const { user } = useAuth();
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);
  const setSupabaseReachable = useNetworkStore((state) => state.setSupabaseReachable);

  const [summaries, setSummaries] = useState<SessionSummaryPayload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadLocalState = async () => {
    const localSummaries = await listSessionSummaries({
      limit,
      query,
    });

    setSummaries(localSummaries);
  };

  const refresh = async (mode: "initial" | "focus" | "pull" = "pull") => {
    const showBlockingState = mode === "initial" && summaries.length === 0;

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
        const syncResult = await syncSessionSummariesFromSupabase(user.id, limit);
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
          : "Unable to refresh session summaries."
      );
      setSupabaseReachable(false);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    void refresh("initial");
  }, [user?.id, supabaseReachable, limit, autoSync, query]);

  useFocusEffect(
    useCallback(() => {
      void refresh("focus");
    }, [user?.id, supabaseReachable, limit, autoSync, query])
  );

  return {
    summaries,
    isLoading,
    isRefreshing,
    isSyncing,
    lastSyncedAt,
    syncError,
    refresh,
  };
}
