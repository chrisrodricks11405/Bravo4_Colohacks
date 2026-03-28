import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  exportSyncDiagnostics,
  getSyncQueueOverview,
  listSyncJobs,
  retryFailedSyncJobs,
  runSyncEngine,
} from "../services";
import { useAuth } from "../providers";
import type { SyncJob, SyncQueueOverview } from "../types";

export function useSyncDashboard(limit = 40) {
  const { user } = useAuth();
  const [overview, setOverview] = useState<SyncQueueOverview | null>(null);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [nextOverview, nextJobs] = await Promise.all([
        getSyncQueueOverview(),
        listSyncJobs({ limit }),
      ]);

      setOverview(nextOverview);
      setJobs(nextJobs);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load sync diagnostics."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load])
  );

  useEffect(() => {
    const interval = setInterval(() => {
      void load(true);
    }, 10_000);

    return () => {
      clearInterval(interval);
    };
  }, [load]);

  const forceSync = useCallback(async () => {
    setIsForceSyncing(true);

    try {
      await runSyncEngine({ userId: user?.id });
      await load(true);
    } finally {
      setIsForceSyncing(false);
    }
  }, [load, user?.id]);

  const retryFailed = useCallback(async () => {
    setIsRetryingFailed(true);

    try {
      await retryFailedSyncJobs({ userId: user?.id });
      await load(true);
    } finally {
      setIsRetryingFailed(false);
    }
  }, [load, user?.id]);

  const exportData = useCallback(async () => {
    return exportSyncDiagnostics(limit);
  }, [limit]);

  return {
    error,
    exportData,
    forceSync,
    isForceSyncing,
    isLoading,
    isRefreshing,
    isRetryingFailed,
    jobs,
    overview,
    refresh: load,
    retryFailed,
  };
}
