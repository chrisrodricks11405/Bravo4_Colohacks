import React, { useEffect, useCallback, useRef } from "react";
import * as Network from "expo-network";
import { useNetworkStore, useSessionStore } from "../stores";

const POLL_INTERVAL = 10_000; // 10 seconds

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const {
    setConnected,
    setConnectionQuality,
    setSupabaseReachable,
    setAIProviderReachable,
    setVoiceServiceReachable,
    setMode,
    updateLastOnline,
  } = useNetworkStore();
  const sessionMode = useSessionStore((state) => state.session?.mode);

  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const checkNetwork = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      const connected = state.isConnected ?? false;
      const internetReachable = Boolean(state.isInternetReachable);
      setConnected(connected);

      if (sessionMode === "offline") {
        setMode("local_hotspot");
      } else if (connected && internetReachable) {
        setMode("online");
      } else if (connected) {
        setMode("local_hotspot");
      } else {
        setMode("offline");
      }

      if (connected && internetReachable) {
        const quality =
          state.type === Network.NetworkStateType.WIFI ||
          state.type === Network.NetworkStateType.ETHERNET
            ? "good"
            : "fair";
        setConnectionQuality(quality);
        setSupabaseReachable(true);
        setAIProviderReachable(true);
        setVoiceServiceReachable(true);
        updateLastOnline();
      } else if (connected) {
        setConnectionQuality("poor");
        setSupabaseReachable(false);
        setAIProviderReachable(false);
        setVoiceServiceReachable(false);
      } else {
        setConnectionQuality("none");
        setSupabaseReachable(false);
        setAIProviderReachable(false);
        setVoiceServiceReachable(false);
      }
    } catch {
      setConnected(false);
      setConnectionQuality("none");
      setSupabaseReachable(false);
      setAIProviderReachable(false);
      setVoiceServiceReachable(false);
      setMode("offline");
    }
  }, [
    sessionMode,
    setAIProviderReachable,
    setConnected,
    setConnectionQuality,
    setMode,
    setSupabaseReachable,
    setVoiceServiceReachable,
    updateLastOnline,
  ]);

  useEffect(() => {
    // Initial check
    checkNetwork();

    // Poll periodically
    intervalRef.current = setInterval(checkNetwork, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkNetwork]);

  return <>{children}</>;
}
