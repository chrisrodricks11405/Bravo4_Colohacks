import React, { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { hasSupabaseConfig } from "../lib/supabase";
import { getSyncQueueOverview, runSyncEngine } from "../services";
import { useNetworkStore } from "../stores";
import { useAuth } from "./AuthProvider";
import { useDatabaseReady } from "./DatabaseProvider";

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const isDatabaseReady = useDatabaseReady();
  const { user } = useAuth();
  const isConnected = useNetworkStore((state) => state.isConnected);
  const setSyncOverview = useNetworkStore((state) => state.setSyncOverview);
  const beginSync = useNetworkStore((state) => state.beginSync);
  const updateSyncProgress = useNetworkStore((state) => state.updateSyncProgress);
  const finishSync = useNetworkStore((state) => state.finishSync);

  const runningRef = useRef(false);

  const refreshOverview = useCallback(async () => {
    if (!isDatabaseReady) {
      return;
    }

    const overview = await getSyncQueueOverview();
    setSyncOverview({
      pendingSyncCount:
        overview.pendingJobs + overview.failedJobs + overview.inProgressJobs,
      failedSyncCount: overview.failedJobs,
      localQueueCount: overview.localQueueCount,
      lastSyncAt: overview.lastSyncAt,
      nextRetryAt: overview.nextRetryAt,
    });
  }, [isDatabaseReady, setSyncOverview]);

  const executeSync = useCallback(async () => {
    if (!isDatabaseReady) {
      return;
    }

    await refreshOverview();

    if (!hasSupabaseConfig || !isConnected || runningRef.current) {
      return;
    }

    runningRef.current = true;

    try {
      const result = await runSyncEngine({
        userId: user?.id,
        onProgress: (snapshot) => {
          if (snapshot.completedJobs === 0 && snapshot.failedJobs === 0) {
            beginSync(snapshot.totalJobs, snapshot.activeJobLabel ?? null);
          }
          updateSyncProgress(
            snapshot.completedJobs,
            snapshot.totalJobs,
            snapshot.activeJobLabel ?? null
          );
        },
      });

      finishSync({
        completedJobs: result.processedJobs + result.failedJobs,
        totalJobs: result.processedJobs + result.failedJobs,
        message: null,
        lastSyncAt: result.overview.lastSyncAt,
      });
    } finally {
      runningRef.current = false;
      await refreshOverview();
    }
  }, [
    beginSync,
    finishSync,
    isConnected,
    isDatabaseReady,
    refreshOverview,
    updateSyncProgress,
    user?.id,
  ]);

  useEffect(() => {
    if (!isDatabaseReady) {
      return;
    }

    void refreshOverview();
  }, [isDatabaseReady, refreshOverview]);

  useEffect(() => {
    if (!isDatabaseReady) {
      return;
    }

    void refreshOverview();
    void executeSync();
  }, [executeSync, isConnected, isDatabaseReady, user?.id, refreshOverview]);

  useEffect(() => {
    if (!isDatabaseReady) {
      return;
    }

    const interval = setInterval(() => {
      void refreshOverview();
      void executeSync();
    }, 15_000);

    return () => {
      clearInterval(interval);
    };
  }, [executeSync, isDatabaseReady, refreshOverview]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        void refreshOverview();
        void executeSync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [executeSync, refreshOverview]);

  return <>{children}</>;
}
