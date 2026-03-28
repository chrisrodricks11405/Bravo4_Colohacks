import React, { useEffect, useMemo } from "react";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { addMonitoringBreadcrumb, setMonitoringSession, setMonitoringTag } from "../../lib/monitoring";
import { sanitizeObjectForMonitoring } from "../../lib/sanitization";
import { useNetworkStore, useSessionStore } from "../../stores";

export function AppRuntimeObserver() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const session = useSessionStore((state) => state.session);
  const networkMode = useNetworkStore((state) => state.mode);

  const serializedParams = useMemo(() => JSON.stringify(sanitizeObjectForMonitoring(params)), [params]);

  useEffect(() => {
    addMonitoringBreadcrumb({
      category: "navigation",
      message: `Navigated to ${pathname}`,
      data: {
        pathname,
        params: JSON.parse(serializedParams) as Record<string, unknown>,
      },
    });
    setMonitoringTag("route", pathname);
  }, [pathname, serializedParams]);

  useEffect(() => {
    setMonitoringSession(session);
  }, [session]);

  useEffect(() => {
    setMonitoringTag("network_mode", networkMode);
  }, [networkMode]);

  return null;
}
