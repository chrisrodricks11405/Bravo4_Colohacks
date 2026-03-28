import React from "react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";

// Configure online manager for offline-aware caching
onlineManager.setEventListener((setOnline) => {
  const check = async () => {
    const state = await Network.getNetworkStateAsync();
    setOnline(state.isConnected ?? false);
  };

  // Check immediately
  check();

  // Re-check periodically
  const interval = setInterval(check, 15_000);
  return () => clearInterval(interval);
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 2,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: 1,
      networkMode: "offlineFirst",
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export { queryClient };
