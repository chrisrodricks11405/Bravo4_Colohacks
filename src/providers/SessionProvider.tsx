import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";
import { getPersistedSession } from "../services/session";
import {
  addMonitoringBreadcrumb,
  captureMonitoringException,
  setMonitoringSession,
} from "../lib/monitoring";
import { useDatabaseReady } from "./DatabaseProvider";
import { useNetworkStore, useSessionStore } from "../stores";

interface SessionHydrationContextValue {
  isHydrating: boolean;
  refreshSession: () => Promise<void>;
}

const SessionHydrationContext = createContext<SessionHydrationContextValue>({
  isHydrating: true,
  refreshSession: async () => undefined,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const isDatabaseReady = useDatabaseReady();
  const setSession = useSessionStore((state) => state.setSession);
  const setMode = useNetworkStore((state) => state.setMode);
  const [isHydrating, setIsHydrating] = useState(true);

  const refreshSession = useCallback(async () => {
    if (!isDatabaseReady) {
      return;
    }

    setIsHydrating(true);

    try {
      const persisted = await getPersistedSession();
      setSession(persisted);
      setMonitoringSession(persisted);

      if (persisted) {
        setMode(persisted.mode === "offline" ? "local_hotspot" : "online");
      }
    } catch (error) {
      console.error("Failed to hydrate session state:", error);
      captureMonitoringException(error, {
        component: "SessionProvider.refreshSession",
      });
      setSession(null);
    } finally {
      setIsHydrating(false);
    }
  }, [isDatabaseReady, setMode, setSession]);

  useEffect(() => {
    if (!isDatabaseReady) {
      return;
    }

    void refreshSession();
  }, [isDatabaseReady, refreshSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      addMonitoringBreadcrumb({
        category: "app-state",
        message: `App state changed to ${status}`,
      });
      if (status === "active") {
        void refreshSession();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshSession]);

  return (
    <SessionHydrationContext.Provider
      value={{
        isHydrating,
        refreshSession,
      }}
    >
      {children}
    </SessionHydrationContext.Provider>
  );
}

export function useSessionHydration() {
  return useContext(SessionHydrationContext);
}
