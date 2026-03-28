import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closePoll,
  createPollDraft,
  getPollDistribution,
  listCachedPolls,
  pushPoll,
  refreshPollHistory,
  refreshPollResponses,
  subscribeToPollSession,
  updatePollDraft,
} from "../services";
import { useSessionStore } from "../stores";
import type {
  PollDistributionSnapshot,
  QuickPollDraftInput,
  QuickPollPayload,
  SessionMeta,
} from "../types";

function sortPolls(polls: QuickPollPayload[]) {
  const statusWeight: Record<QuickPollPayload["status"], number> = {
    active: 0,
    draft: 1,
    closed: 2,
  };

  return [...polls].sort((left, right) => {
    if (statusWeight[left.status] !== statusWeight[right.status]) {
      return statusWeight[left.status] - statusWeight[right.status];
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function useLivePolls(
  session: SessionMeta | null,
  realtimeEnabled: boolean
) {
  const activePoll = useSessionStore((state) => state.activePoll);
  const pollDistribution = useSessionStore((state) => state.pollDistribution);
  const setActivePoll = useSessionStore((state) => state.setActivePoll);
  const updatePollDistribution = useSessionStore(
    (state) => state.updatePollDistribution
  );

  const [pollHistory, setPollHistory] = useState<QuickPollPayload[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedPollIdRef = useRef<string | null>(null);

  const selectedPoll = useMemo(
    () =>
      pollHistory.find((poll) => poll.id === selectedPollId) ??
      activePoll ??
      pollHistory[0] ??
      null,
    [activePoll, pollHistory, selectedPollId]
  );

  useEffect(() => {
    selectedPollIdRef.current = selectedPollId;
  }, [selectedPollId]);

  const hydratePollState = useCallback(
    async (preferredPollId?: string | null) => {
      if (!session?.id) {
        setPollHistory([]);
        setSelectedPollId(null);
        setActivePoll(null);
        updatePollDistribution(null);
        setIsHydrating(false);
        return;
      }

      setIsHydrating(true);

      try {
        if (realtimeEnabled) {
          await refreshPollHistory(session.id);
        }

        const cachedPolls = sortPolls(await listCachedPolls(session.id));
        const nextActivePoll = cachedPolls.find((poll) => poll.status === "active") ?? null;
        const nextSelectedPollId =
          preferredPollId && cachedPolls.some((poll) => poll.id === preferredPollId)
            ? preferredPollId
            : selectedPollIdRef.current &&
                cachedPolls.some((poll) => poll.id === selectedPollIdRef.current)
              ? selectedPollIdRef.current
              : nextActivePoll?.id ?? cachedPolls[0]?.id ?? null;

        setPollHistory(cachedPolls);
        setActivePoll(nextActivePoll);
        setSelectedPollId(nextSelectedPollId);
        setError(null);

        if (nextSelectedPollId) {
          const targetPoll = cachedPolls.find((poll) => poll.id === nextSelectedPollId) ?? null;
          if (targetPoll) {
            if (realtimeEnabled) {
              await refreshPollResponses(session.id, targetPoll.id);
            }
            const distribution = await getPollDistribution(targetPoll);
            updatePollDistribution(distribution);
          }
        } else {
          updatePollDistribution(null);
        }
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "We could not refresh the poll panel."
        );
      } finally {
        setIsHydrating(false);
      }
    },
    [
      realtimeEnabled,
      session?.id,
      setActivePoll,
      updatePollDistribution,
    ]
  );

  const refreshSelectedDistribution = useCallback(
    async (poll: QuickPollPayload | null) => {
      if (!session?.id || !poll) {
        updatePollDistribution(null);
        return null;
      }

      if (realtimeEnabled) {
        await refreshPollResponses(session.id, poll.id);
      }

      const distribution = await getPollDistribution(poll);
      updatePollDistribution(distribution);
      return distribution;
    },
    [realtimeEnabled, session?.id, updatePollDistribution]
  );

  const scheduleRefresh = useCallback(
    (preferredPollId?: string | null) => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        void hydratePollState(preferredPollId);
      }, 350);
    },
    [hydratePollState]
  );

  useEffect(() => {
    void hydratePollState();
  }, [hydratePollState]);

  useEffect(() => {
    if (!session?.id || !selectedPoll) {
      return;
    }

    void refreshSelectedDistribution(selectedPoll);
  }, [refreshSelectedDistribution, selectedPoll, session?.id]);

  useEffect(() => {
    if (!session?.id || !realtimeEnabled) {
      return;
    }

    const unsubscribe = subscribeToPollSession(session.id, {
      onPollEvent: () => {
        scheduleRefresh();
      },
      onResponseEvent: () => {
        if (selectedPoll?.id) {
          scheduleRefresh(selectedPoll.id);
        } else {
          scheduleRefresh();
        }
      },
      onBroadcastEvent: () => {
        scheduleRefresh();
      },
      onStatusChange: (status) => {
        if (status === "CHANNEL_ERROR") {
          setError("Live poll updates are reconnecting.");
        }
      },
    });

    return () => {
      unsubscribe();
    };
  }, [realtimeEnabled, scheduleRefresh, selectedPoll?.id, session?.id]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!session?.id) {
      return;
    }

    const interval = setInterval(() => {
      void hydratePollState(selectedPollIdRef.current);
    }, 5_000);

    return () => {
      clearInterval(interval);
    };
  }, [hydratePollState, session?.id]);

  const saveDraft = useCallback(
    async (input: QuickPollDraftInput, pollId?: string | null) => {
      if (!session?.id) {
        throw new Error("Start a session before creating a poll.");
      }

      setIsSavingDraft(true);

      try {
        const nextPoll = pollId
          ? await updatePollDraft(pollId, input, {
              attemptRemoteSync: realtimeEnabled,
              queueOnFailure: true,
            })
          : await createPollDraft(session.id, input, {
              attemptRemoteSync: realtimeEnabled,
              queueOnFailure: true,
            });

        await hydratePollState(nextPoll.id);
        return nextPoll;
      } finally {
        setIsSavingDraft(false);
      }
    },
    [hydratePollState, realtimeEnabled, session?.id]
  );

  const activatePoll = useCallback(
    async (pollId: string) => {
      setIsPushing(true);

      try {
        const nextPoll = await pushPoll(pollId, {
          attemptRemoteSync: realtimeEnabled,
          queueOnFailure: true,
        });
        await hydratePollState(nextPoll.id);
        return nextPoll;
      } finally {
        setIsPushing(false);
      }
    },
    [hydratePollState, realtimeEnabled]
  );

  const closeActivePoll = useCallback(
    async (pollId: string) => {
      setIsClosing(true);

      try {
        const nextPoll = await closePoll(pollId, {
          attemptRemoteSync: realtimeEnabled,
          queueOnFailure: true,
        });
        await hydratePollState(nextPoll.id);
        return nextPoll;
      } finally {
        setIsClosing(false);
      }
    },
    [hydratePollState, realtimeEnabled]
  );

  const handleSelectPoll = useCallback(
    async (pollId: string) => {
      setSelectedPollId(pollId);

      const targetPoll = pollHistory.find((poll) => poll.id === pollId) ?? null;
      if (targetPoll) {
        try {
          await refreshSelectedDistribution(targetPoll);
        } catch (nextError) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "We could not refresh poll results."
          );
        }
      }
    },
    [pollHistory, refreshSelectedDistribution]
  );

  return {
    activePoll,
    error,
    isClosing,
    isHydrating,
    isPushing,
    isSavingDraft,
    pollDistribution: pollDistribution as PollDistributionSnapshot | null,
    pollHistory,
    refreshPolls: hydratePollState,
    saveDraft,
    selectPoll: handleSelectPoll,
    selectedPoll,
    selectedPollId,
    setSelectedPollId,
    startPoll: activatePoll,
    stopPoll: closeActivePoll,
  };
}
