import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTrendPoint,
  computeLostPercent,
  createIntervention,
  createLessonMarker,
  endLiveSession,
  fetchLiveSessionSnapshot,
  listCachedClusters,
  listCachedPulseSnapshots,
  listInterventions,
  listLessonMarkers,
  persistClusters,
  persistPulseSnapshot,
  refreshInterventions,
  subscribeToLiveSession,
  updateClusterStatus,
  updateIntervention,
} from "../services";
import { useSessionStore } from "../stores";
import type {
  ClusterStatus,
  ConfusionTrendPoint,
  InterventionActionPayload,
  InterventionType,
  LessonMarkerType,
  PulseAggregateSnapshot,
  SessionMeta,
} from "../types";

export type LiveDashboardRemoteState =
  | "live"
  | "connecting"
  | "degraded"
  | "disabled";

type RecoveryTrendSample = {
  timestamp: string;
  confusionIndex: number;
};

function shouldPersistTrendPoint(
  latestTrendPoint: ConfusionTrendPoint | undefined,
  snapshot: PulseAggregateSnapshot
) {
  if (!latestTrendPoint) {
    return true;
  }

  const elapsedMs =
    new Date(snapshot.timestamp).getTime() -
    new Date(latestTrendPoint.timestamp).getTime();

  if (!Number.isFinite(elapsedMs) || elapsedMs >= 4_000) {
    return true;
  }

  return (
    latestTrendPoint.confusionIndex !== snapshot.confusionIndex ||
    latestTrendPoint.lostPercent !== computeLostPercent(snapshot)
  );
}

function buildHydratedTrend(
  snapshots: PulseAggregateSnapshot[],
  interventionLog: InterventionActionPayload[]
) {
  const basePoints = snapshots.map((snapshot) => buildTrendPoint(snapshot));

  if (snapshots.length === 0 || interventionLog.length === 0) {
    return basePoints.slice(-300);
  }

  const interventionPoints = interventionLog
    .map((intervention) => {
      const contextSnapshot =
        [...snapshots]
          .reverse()
          .find((snapshot) => snapshot.timestamp <= intervention.timestamp) ??
        snapshots[snapshots.length - 1];

      if (!contextSnapshot) {
        return null;
      }

      return buildTrendPoint(
        {
          ...contextSnapshot,
          timestamp: intervention.timestamp,
        },
        intervention.id
      );
    })
    .filter((point): point is ConfusionTrendPoint => Boolean(point));

  return [...basePoints, ...interventionPoints]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .slice(-300);
}

function buildRecoveryTrendSamples(
  trend: ConfusionTrendPoint[],
  currentPulse: PulseAggregateSnapshot | null
) {
  const samples = trend
    .filter((point) => !point.hasInterventionMarker)
    .map((point) => ({
      timestamp: point.timestamp,
      confusionIndex: point.confusionIndex,
    }));

  if (
    currentPulse &&
    !samples.some((sample) => sample.timestamp === currentPulse.timestamp)
  ) {
    samples.push({
      timestamp: currentPulse.timestamp,
      confusionIndex: currentPulse.confusionIndex,
    });
  }

  return samples.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function averageConfusionBetween(
  samples: RecoveryTrendSample[],
  startMs: number,
  endMs: number,
  fallbackValue: number
) {
  const windowPoints = samples.filter((sample) => {
    const sampleMs = new Date(sample.timestamp).getTime();
    return Number.isFinite(sampleMs) && sampleMs >= startMs && sampleMs <= endMs;
  });

  if (windowPoints.length === 0) {
    return fallbackValue;
  }

  const total = windowPoints.reduce((sum, sample) => sum + sample.confusionIndex, 0);
  return Math.round((total / windowPoints.length) * 10) / 10;
}

function computeBaselineConfusion(args: {
  currentPulse: PulseAggregateSnapshot | null;
  recoveryWindowSeconds: number;
  timestamp: string;
  trend: ConfusionTrendPoint[];
}) {
  const { currentPulse, recoveryWindowSeconds, timestamp, trend } = args;
  const interventionMs = new Date(timestamp).getTime();
  const samples = buildRecoveryTrendSamples(trend, currentPulse);
  const fallbackValue = currentPulse?.confusionIndex ?? samples[samples.length - 1]?.confusionIndex ?? 0;

  return averageConfusionBetween(
    samples,
    interventionMs - recoveryWindowSeconds * 1_000,
    interventionMs,
    fallbackValue
  );
}

function measureRecovery(args: {
  currentPulse: PulseAggregateSnapshot | null;
  intervention: InterventionActionPayload;
  trend: ConfusionTrendPoint[];
}) {
  const { currentPulse, intervention, trend } = args;
  const interventionMs = new Date(intervention.timestamp).getTime();
  const windowEndMs = interventionMs + intervention.recoveryWindowSeconds * 1_000;

  if (!Number.isFinite(interventionMs) || Date.now() < windowEndMs) {
    return null;
  }

  const samples = buildRecoveryTrendSamples(trend, currentPulse);
  const afterSamples = samples.filter((sample) => {
    const sampleMs = new Date(sample.timestamp).getTime();
    return Number.isFinite(sampleMs) && sampleMs > interventionMs && sampleMs <= windowEndMs;
  });
  const fallbackAfterSample = [...samples]
    .reverse()
    .find((sample) => {
      const sampleMs = new Date(sample.timestamp).getTime();
      return Number.isFinite(sampleMs) && sampleMs > interventionMs;
    });

  if (afterSamples.length === 0 && !fallbackAfterSample) {
    return null;
  }

  const confusionAfter =
    afterSamples.length > 0
      ? averageConfusionBetween(
          afterSamples,
          interventionMs + 1,
          windowEndMs,
          afterSamples[afterSamples.length - 1]?.confusionIndex ??
            intervention.confusionBefore
        )
      : fallbackAfterSample?.confusionIndex ?? intervention.confusionBefore;
  const recoveryScore =
    Math.round((intervention.confusionBefore - confusionAfter) * 10) / 10;

  return {
    confusionAfter,
    recoveryScore,
  };
}

export function useLiveDashboard(
  session: SessionMeta | null,
  realtimeEnabled: boolean,
  recoveryWindowSeconds = 60
) {
  const currentPulse = useSessionStore((state) => state.currentPulse);
  const confusionTrend = useSessionStore((state) => state.confusionTrend);
  const clusters = useSessionStore((state) => state.clusters);
  const pinnedClusterIds = useSessionStore((state) => state.pinnedClusterIds);
  const selectedClusterId = useSessionStore((state) => state.selectedClusterId);
  const lessonMarkers = useSessionStore((state) => state.lessonMarkers);
  const interventions = useSessionStore((state) => state.interventions);

  const setSession = useSessionStore((state) => state.setSession);
  const updateParticipantCount = useSessionStore((state) => state.updateParticipantCount);
  const updatePulse = useSessionStore((state) => state.updatePulse);
  const addTrendPoint = useSessionStore((state) => state.addTrendPoint);
  const setConfusionTrend = useSessionStore((state) => state.setConfusionTrend);
  const setClusters = useSessionStore((state) => state.setClusters);
  const updateCluster = useSessionStore((state) => state.updateCluster);
  const clearClusterPin = useSessionStore((state) => state.clearClusterPin);
  const setLessonMarkers = useSessionStore((state) => state.setLessonMarkers);
  const addLessonMarker = useSessionStore((state) => state.addLessonMarker);
  const setInterventions = useSessionStore((state) => state.setInterventions);
  const addIntervention = useSessionStore((state) => state.addIntervention);
  const selectCluster = useSessionStore((state) => state.selectCluster);
  const toggleClusterPin = useSessionStore((state) => state.toggleClusterPin);

  const [isHydrating, setIsHydrating] = useState(true);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteState, setRemoteState] = useState<LiveDashboardRemoteState>(
    realtimeEnabled ? "connecting" : "disabled"
  );
  const [interventionWindowStartedAt, setInterventionWindowStartedAt] = useState<string | null>(
    null
  );

  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clusterRefreshRequestedRef = useRef(true);
  const lastClusterRefreshAtRef = useRef(0);
  const settlingInterventionIdsRef = useRef(new Set<string>());

  const sortedClusters = useMemo(() => {
    const statusWeight: Record<ClusterStatus, number> = {
      active: 0,
      acknowledged: 1,
      resolved: 2,
      dismissed: 3,
    };

    return [...clusters].sort((left, right) => {
      const leftPinned = pinnedClusterIds.includes(left.id);
      const rightPinned = pinnedClusterIds.includes(right.id);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      if (statusWeight[left.status] !== statusWeight[right.status]) {
        return statusWeight[left.status] - statusWeight[right.status];
      }

      if (right.affectedCount !== left.affectedCount) {
        return right.affectedCount - left.affectedCount;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [clusters, pinnedClusterIds]);

  const activeCluster = useMemo(
    () =>
      sortedClusters.find(
        (cluster) =>
          cluster.status !== "dismissed" && cluster.status !== "resolved"
      ) ?? null,
    [sortedClusters]
  );

  const selectedCluster = useMemo(
    () => {
      const explicitSelection = sortedClusters.find(
        (cluster) => cluster.id === selectedClusterId
      );

      if (explicitSelection && explicitSelection.status !== "dismissed") {
        return explicitSelection;
      }

      return activeCluster;
    },
    [activeCluster, selectedClusterId, sortedClusters]
  );

  const latestLessonMarker = lessonMarkers[lessonMarkers.length - 1] ?? null;

  const commitPulseSnapshot = useCallback(
    async (snapshot: PulseAggregateSnapshot) => {
      updatePulse(snapshot);

      const latestTrendPoint = confusionTrend[confusionTrend.length - 1];
      if (!shouldPersistTrendPoint(latestTrendPoint, snapshot)) {
        return;
      }

      await persistPulseSnapshot(snapshot);
      addTrendPoint(buildTrendPoint(snapshot));
    },
    [addTrendPoint, confusionTrend, updatePulse]
  );

  const refreshInterventionLog = useCallback(async () => {
    if (!session?.id) {
      return;
    }

    try {
      const [snapshots, nextInterventions] = await Promise.all([
        listCachedPulseSnapshots(session.id),
        realtimeEnabled
          ? refreshInterventions(session.id)
          : listInterventions(session.id),
      ]);

      setConfusionTrend(buildHydratedTrend(snapshots, nextInterventions));
      setInterventions(nextInterventions);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "We could not refresh intervention history."
      );
    }
  }, [realtimeEnabled, session?.id, setConfusionTrend, setInterventions]);

  const refreshLiveData = useCallback(async () => {
    if (!session?.id) {
      return;
    }

    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;

    try {
      const shouldRefreshClusters =
        clusterRefreshRequestedRef.current ||
        clusters.length === 0 ||
        Date.now() - lastClusterRefreshAtRef.current >= 30_000;
      const clusterRefresh = shouldRefreshClusters
        ? clusters.length === 0
          ? "force"
          : "ensure"
        : "none";
      const liveSnapshot = await fetchLiveSessionSnapshot(session.id, {
        clusterRefresh,
        lessonMarkers,
        session,
        preferLocal: !realtimeEnabled,
      });

      if (liveSnapshot.pulse) {
        await commitPulseSnapshot(liveSnapshot.pulse);
        updateParticipantCount(
          liveSnapshot.participantRoster.totalJoined ||
            liveSnapshot.pulse.totalActive + liveSnapshot.pulse.disconnectedCount
        );
      } else if (liveSnapshot.participantRoster.totalJoined > 0) {
        updateParticipantCount(liveSnapshot.participantRoster.totalJoined);
      }

      if (liveSnapshot.clusters.length > 0) {
        await persistClusters(liveSnapshot.clusters);
      }

      setClusters(liveSnapshot.clusters);
      if (clusterRefresh !== "none") {
        clusterRefreshRequestedRef.current = false;
        lastClusterRefreshAtRef.current = Date.now();
      }
      setError(null);
      if (realtimeEnabled) {
        setRemoteState("live");
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "We could not refresh the live classroom pulse."
      );
      setRemoteState(realtimeEnabled ? "degraded" : "disabled");
    } finally {
      refreshInFlightRef.current = false;

      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        void refreshLiveData();
      }
    }
  }, [
    clusters.length,
    commitPulseSnapshot,
    lessonMarkers,
    realtimeEnabled,
    session,
    session?.id,
    setClusters,
    updateParticipantCount,
  ]);

  const scheduleRefresh = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }

    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
      void refreshLiveData();
    }, 250);
  }, [refreshLiveData]);

  useEffect(() => {
    if (!session?.id) {
      setIsHydrating(false);
      return;
    }

    let isMounted = true;

    const hydrate = async () => {
      setIsHydrating(true);
      setError(null);
      setRemoteState(realtimeEnabled ? "connecting" : "disabled");

      try {
        const [snapshots, markers, savedInterventions, savedClusters] =
          await Promise.all([
            listCachedPulseSnapshots(session.id),
            listLessonMarkers(session.id),
            realtimeEnabled
              ? refreshInterventions(session.id)
              : listInterventions(session.id),
            listCachedClusters(session.id),
          ]);

        if (!isMounted) {
          return;
        }

        setConfusionTrend(buildHydratedTrend(snapshots, savedInterventions));
        setLessonMarkers(markers);
        setInterventions(savedInterventions);
        setClusters(savedClusters);
        updatePulse(snapshots[snapshots.length - 1] ?? null);

        if (snapshots.length > 0) {
          const latestSnapshot = snapshots[snapshots.length - 1];
          updateParticipantCount(latestSnapshot.totalActive + latestSnapshot.disconnectedCount);
        }

        await refreshLiveData();

        if (realtimeEnabled && isMounted) {
          setRemoteState("live");
        }
      } catch (hydrateError) {
        if (!isMounted) {
          return;
        }

        setError(
          hydrateError instanceof Error
            ? hydrateError.message
            : "We could not restore the live dashboard."
        );
      } finally {
        if (isMounted) {
          setIsHydrating(false);
        }
      }
    };

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [
    realtimeEnabled,
    refreshLiveData,
    session?.id,
    setClusters,
    setConfusionTrend,
    setInterventions,
    setLessonMarkers,
    updateParticipantCount,
    updatePulse,
  ]);

  useEffect(() => {
    if (!session?.id) {
      return;
    }

    if (!realtimeEnabled) {
      setRemoteState("disabled");
      return;
    }

    setRemoteState("connecting");

    return subscribeToLiveSession(session.id, {
      onPulseEvent: scheduleRefresh,
      onParticipantEvent: scheduleRefresh,
      onQuestionEvent: () => {
        clusterRefreshRequestedRef.current = true;
        scheduleRefresh();
      },
      onClusterEvent: scheduleRefresh,
      onInterventionEvent: () => {
        void refreshInterventionLog();
      },
      onStatusChange: (status) => {
        if (status === "SUBSCRIBED") {
          setRemoteState("live");
          scheduleRefresh();
          return;
        }

        if (status === "disabled") {
          setRemoteState("disabled");
          return;
        }

        setRemoteState("degraded");
      },
      onError: (message) => {
        setError(message);
      },
    });
  }, [realtimeEnabled, refreshInterventionLog, scheduleRefresh, session?.id]);

  useEffect(() => {
    if (!session?.id) {
      return;
    }

    const interval = setInterval(() => {
      void refreshLiveData();
    }, 5_000);

    return () => {
      clearInterval(interval);
    };
  }, [refreshLiveData, session?.id]);

  useEffect(() => {
    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session || !currentPulse) {
      setInterventionWindowStartedAt(null);
      return;
    }

    const lostPercent = computeLostPercent(currentPulse);
    const requiresAttention =
      lostPercent >= session.lostThreshold ||
      currentPulse.confusionIndex >= session.lostThreshold;

    if (requiresAttention) {
      setInterventionWindowStartedAt((activeTimestamp) => activeTimestamp ?? currentPulse.timestamp);
      return;
    }

    setInterventionWindowStartedAt(null);
  }, [currentPulse, session]);

  useEffect(() => {
    if (!session?.id || interventions.length === 0) {
      return;
    }

    const pendingInterventions = interventions.filter(
      (intervention) => intervention.confusionAfter == null
    );

    pendingInterventions.forEach((intervention) => {
      const measurement = measureRecovery({
        currentPulse,
        intervention,
        trend: confusionTrend,
      });

      if (!measurement || settlingInterventionIdsRef.current.has(intervention.id)) {
        return;
      }

      settlingInterventionIdsRef.current.add(intervention.id);

      void (async () => {
        try {
          const settledIntervention = await updateIntervention(
            {
              ...intervention,
              confusionAfter: measurement.confusionAfter,
              recoveryScore: measurement.recoveryScore,
            },
            {
              attemptRemoteSync: realtimeEnabled,
              queueOnFailure: true,
            }
          );

          addIntervention(settledIntervention);
        } catch (settleError) {
          setError(
            settleError instanceof Error
              ? settleError.message
              : "We could not measure intervention recovery."
          );
        } finally {
          settlingInterventionIdsRef.current.delete(intervention.id);
        }
      })();
    });
  }, [
    addIntervention,
    confusionTrend,
    currentPulse,
    interventions,
    realtimeEnabled,
    session?.id,
  ]);

  const markLessonSegment = useCallback(
    async (type: LessonMarkerType, label?: string) => {
      if (!session?.id) {
        throw new Error("No active session loaded.");
      }

      const marker = await createLessonMarker({
        sessionId: session.id,
        type,
        label,
        attemptRemoteSync: realtimeEnabled,
        queueOnFailure: true,
      });

      addLessonMarker(marker);
      return marker;
    },
    [addLessonMarker, realtimeEnabled, session?.id]
  );

  const logIntervention = useCallback(
    async (
      type: InterventionType,
      options?: {
        clusterId?: string;
        lessonMarkerId?: string;
        notes?: string;
        recoveryWindowSeconds?: number;
      }
    ) => {
      if (!session?.id) {
        throw new Error("No active session loaded.");
      }

      const timestamp = new Date().toISOString();
      const nextRecoveryWindowSeconds =
        options?.recoveryWindowSeconds ?? recoveryWindowSeconds;
      const durationSeconds = interventionWindowStartedAt
        ? Math.max(
            0,
            Math.round(
              (new Date(timestamp).getTime() -
                new Date(interventionWindowStartedAt).getTime()) /
                1000
            )
          )
        : undefined;

      const intervention = await createIntervention({
        sessionId: session.id,
        type,
        clusterId: options?.clusterId,
        lessonMarkerId: options?.lessonMarkerId,
        confusionBefore: computeBaselineConfusion({
          currentPulse,
          recoveryWindowSeconds: nextRecoveryWindowSeconds,
          timestamp,
          trend: confusionTrend,
        }),
        recoveryWindowSeconds: nextRecoveryWindowSeconds,
        durationSeconds,
        notes: options?.notes,
        timestamp,
        attemptRemoteSync: realtimeEnabled,
        queueOnFailure: true,
      });

      addIntervention(intervention);

      if (currentPulse) {
        addTrendPoint(
          buildTrendPoint(
            {
              ...currentPulse,
              timestamp,
            },
            intervention.id
          )
        );
      } else {
        const latestPulsePoint = [...confusionTrend]
          .reverse()
          .find((point) => !point.hasInterventionMarker);

        if (latestPulsePoint) {
          addTrendPoint({
            ...latestPulsePoint,
            timestamp,
            hasInterventionMarker: true,
            interventionId: intervention.id,
          });
        }
      }

      setInterventionWindowStartedAt(timestamp);

      return intervention;
    },
    [
      addIntervention,
      addTrendPoint,
      confusionTrend,
      currentPulse,
      interventionWindowStartedAt,
      realtimeEnabled,
      recoveryWindowSeconds,
      session?.id,
    ]
  );

  const changeActiveClusterStatus = useCallback(
    async (clusterId: string, status: ClusterStatus) => {
      if (!session?.id) {
        return null;
      }

      await updateClusterStatus({
        sessionId: session.id,
        clusterId,
        status,
      });

      if (status === "dismissed" || status === "resolved") {
        clearClusterPin(clusterId);
      }

      updateCluster(clusterId, {
        status,
        updatedAt: new Date().toISOString(),
      });

      return clusters.find((cluster) => cluster.id === clusterId) ?? null;
    },
    [clearClusterPin, clusters, session?.id, updateCluster]
  );

  const endSession = useCallback(async () => {
    if (!session) {
      throw new Error("No active session loaded.");
    }

    setIsEndingSession(true);

    try {
      const nextSession = await endLiveSession(session, {
        attemptRemoteSync: realtimeEnabled,
        queueOnFailure: true,
      });
      setSession(nextSession);
      return nextSession;
    } finally {
      setIsEndingSession(false);
    }
  }, [realtimeEnabled, session, setSession]);

  return {
    activeCluster,
    clusters: sortedClusters,
    currentPulse,
    confusionTrend,
    error,
    interventions,
    interventionWindowStartedAt,
    isEndingSession,
    isHydrating,
    latestLessonMarker,
    lessonMarkers,
    logIntervention,
    markLessonSegment,
    changeClusterStatus: changeActiveClusterStatus,
    pinnedClusterIds,
    selectedCluster,
    selectCluster,
    toggleClusterPin,
    endSession,
    refreshLiveData,
    remoteState,
  };
}
