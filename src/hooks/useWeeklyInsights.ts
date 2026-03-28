import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { hasSupabaseConfig } from "../lib/supabase";
import { useAuth } from "../providers";
import {
  generateWeeklyInsightReport,
  getCachedWeeklyInsight,
  resolveWeeklyDateRange,
  syncSessionSummariesFromSupabase,
} from "../services";
import { useNetworkStore } from "../stores";
import type { WeeklyInsightPayload, WeeklyRangePreset } from "../types";

interface UseWeeklyInsightsOptions {
  preset?: WeeklyRangePreset;
  customRange?: { startDate: string; endDate: string };
  autoSync?: boolean;
}

export function useWeeklyInsights({
  preset = "this_week",
  customRange,
  autoSync = true,
}: UseWeeklyInsightsOptions = {}) {
  const { user } = useAuth();
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);
  const setSupabaseReachable = useNetworkStore((state) => state.setSupabaseReachable);
  const [insight, setInsight] = useState<WeeklyInsightPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const range = useMemo(
    () => resolveWeeklyDateRange(preset, customRange),
    [preset, customRange?.startDate, customRange?.endDate]
  );

  const teacherId = user?.id ?? "local_teacher";

  const loadCachedInsight = async () => {
    const cached = await getCachedWeeklyInsight({
      teacherId,
      range,
    });

    if (cached) {
      setInsight(cached);
      setLastGeneratedAt(cached.generatedAt);
    }

    return cached;
  };

  const refresh = async (mode: "initial" | "focus" | "pull" = "pull") => {
    const showBlockingState = mode === "initial" && !insight;

    if (showBlockingState) {
      setIsLoading(true);
    }

    if (mode === "pull") {
      setIsRefreshing(true);
    }

    try {
      await loadCachedInsight();

      let nextSyncError: string | null = null;

      if (autoSync && supabaseReachable && user?.id && hasSupabaseConfig) {
        setIsSyncing(true);

        try {
          await syncSessionSummariesFromSupabase(user.id, {
            startDate: range.startDate,
            endDate: range.endDate,
            limit: 240,
          });
          setSupabaseReachable(true);
        } catch (error) {
          nextSyncError =
            error instanceof Error
              ? error.message
              : "Unable to refresh weekly summaries from Supabase.";
          setSupabaseReachable(false);
        } finally {
          setIsSyncing(false);
        }
      } else if (!hasSupabaseConfig) {
        setSupabaseReachable(false);
      }

      const freshInsight = await generateWeeklyInsightReport({
        teacherId,
        range,
      });

      setInsight(freshInsight);
      setLastGeneratedAt(freshInsight.generatedAt);
      setSyncError(nextSyncError);
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Unable to generate weekly teaching insights."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    void refresh("initial");
  }, [teacherId, supabaseReachable, autoSync, range.startDate, range.endDate, range.preset]);

  useFocusEffect(
    useCallback(() => {
      void refresh("focus");
    }, [teacherId, supabaseReachable, autoSync, range.startDate, range.endDate, range.preset])
  );

  return {
    insight,
    range,
    isLoading,
    isRefreshing,
    isSyncing,
    lastGeneratedAt,
    syncError,
    refresh,
  };
}
