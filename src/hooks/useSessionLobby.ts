import { useCallback, useEffect, useState } from "react";
import { useSessionStore } from "../stores";
import type { SessionMeta } from "../types";
import {
  beginLiveSession,
  fetchRemoteSession,
  getPersistedSession,
  regenerateSessionJoinCode,
  subscribeToSessionLobby,
  toggleSessionLock,
} from "../services/session";

type RemoteState = "live" | "connecting" | "degraded" | "disabled";

export function useSessionLobby(sessionId?: string, realtimeEnabled = true) {
  const activeSession = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const updateParticipantCount = useSessionStore((state) => state.updateParticipantCount);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteState>(
    realtimeEnabled ? "connecting" : "disabled"
  );
  const [isLocking, setIsLocking] = useState(false);
  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);
  const [isStartingClass, setIsStartingClass] = useState(false);

  const resolvedSessionId = sessionId ?? activeSession?.id;
  const session =
    activeSession && (!resolvedSessionId || activeSession.id === resolvedSessionId)
      ? activeSession
      : null;

  const hydrateSession = useCallback(async () => {
    const currentSession = useSessionStore.getState().session;

    if (!resolvedSessionId && !currentSession) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const persisted =
        currentSession && (!resolvedSessionId || currentSession.id === resolvedSessionId)
          ? currentSession
          : await getPersistedSession(resolvedSessionId);

      if (!persisted) {
        setError("We could not find this session locally.");
        setIsLoading(false);
        return;
      }

      setSession(persisted);

      if (realtimeEnabled) {
        try {
          const remoteSession = await fetchRemoteSession(persisted.id);
          if (remoteSession) {
            setSession(remoteSession);
          }
        } catch {
          // Local state is already good enough to render the lobby.
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "We could not restore the current session."
      );
    } finally {
      setIsLoading(false);
    }
  }, [resolvedSessionId, realtimeEnabled, setSession]);

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    if (!session?.id) {
      setRemoteState(realtimeEnabled ? "connecting" : "disabled");
      return;
    }

    if (!realtimeEnabled) {
      setRemoteState("disabled");
      return;
    }

    setRemoteState("connecting");

    return subscribeToSessionLobby(session.id, {
      onParticipantCount: (count) => {
        updateParticipantCount(count);
      },
      onSessionUpdated: (nextSession) => {
        setSession(nextSession);
      },
      onStatusChange: (status) => {
        if (status === "SUBSCRIBED") {
          setRemoteState("live");
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
  }, [realtimeEnabled, session?.id, setSession, updateParticipantCount]);

  const persistSession = useCallback(
    async (
      nextSessionPromise: Promise<SessionMeta>,
      setPending: (value: boolean) => void
    ) => {
      setPending(true);
      setError(null);

      try {
        const nextSession = await nextSessionPromise;
        setSession(nextSession);
        return nextSession;
      } catch (mutationError) {
        const message =
          mutationError instanceof Error
            ? mutationError.message
            : "We could not update the session.";
        setError(message);
        throw mutationError;
      } finally {
        setPending(false);
      }
    },
    [setSession]
  );

  const lockSession = useCallback(
    async (attemptRemoteSync: boolean) => {
      if (!session) {
        throw new Error("No active session loaded.");
      }

      return persistSession(
        toggleSessionLock(session, {
          attemptRemoteSync,
          queueOnFailure: true,
        }),
        setIsLocking
      );
    },
    [persistSession, session]
  );

  const regenerateCode = useCallback(
    async (attemptRemoteSync: boolean) => {
      if (!session) {
        throw new Error("No active session loaded.");
      }

      return persistSession(
        regenerateSessionJoinCode(session, {
          attemptRemoteSync,
          queueOnFailure: true,
        }),
        setIsRegeneratingCode
      );
    },
    [persistSession, session]
  );

  const beginClass = useCallback(
    async (attemptRemoteSync: boolean) => {
      if (!session) {
        throw new Error("No active session loaded.");
      }

      return persistSession(
        beginLiveSession(session, {
          attemptRemoteSync,
          queueOnFailure: true,
        }),
        setIsStartingClass
      );
    },
    [persistSession, session]
  );

  return {
    session,
    isLoading,
    error,
    remoteState,
    isLocking,
    isRegeneratingCode,
    isStartingClass,
    hydrateSession,
    lockSession,
    regenerateCode,
    beginClass,
  };
}
