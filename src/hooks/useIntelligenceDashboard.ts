import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSessionSummaries } from "./useSessionSummaries";
import { useWeeklyInsights } from "./useWeeklyInsights";
import { buildIntelligenceDashboard } from "../services";
import { usePreferencesStore } from "../stores";

export function useIntelligenceDashboard() {
  const preferences = usePreferencesStore(
    useShallow((state) => ({
      defaultSubject: state.defaultSubject,
      defaultGradeClass: state.defaultGradeClass,
      defaultLanguage: state.defaultLanguage,
      defaultLostThreshold: state.defaultLostThreshold,
      voiceEnabled: state.voiceEnabled,
      aiProviderEnabled: state.aiProviderEnabled,
      ttsLocale: state.ttsLocale,
      ttsVoice: state.ttsVoice,
      theme: state.theme,
    }))
  );
  const summariesState = useSessionSummaries({
    limit: 48,
    autoSync: true,
  });
  const weeklyState = useWeeklyInsights({
    preset: "this_week",
    autoSync: true,
  });

  const dashboard = useMemo(
    () =>
      buildIntelligenceDashboard({
        summaries: summariesState.summaries,
        weeklyInsight: weeklyState.insight,
        preferences,
      }),
    [
      summariesState.summaries,
      weeklyState.insight,
      preferences.defaultSubject,
      preferences.defaultGradeClass,
      preferences.defaultLanguage,
      preferences.defaultLostThreshold,
      preferences.voiceEnabled,
      preferences.aiProviderEnabled,
      preferences.ttsLocale,
      preferences.ttsVoice,
      preferences.theme,
    ]
  );

  const refresh = useCallback(async () => {
    await Promise.allSettled([
      summariesState.refresh("pull"),
      weeklyState.refresh("pull"),
    ]);
  }, [summariesState, weeklyState]);

  return {
    dashboard,
    isLoading:
      summariesState.isLoading &&
      weeklyState.isLoading &&
      summariesState.summaries.length === 0 &&
      !weeklyState.insight,
    isRefreshing: summariesState.isRefreshing || weeklyState.isRefreshing,
    isSyncing: summariesState.isSyncing || weeklyState.isSyncing,
    error: summariesState.syncError ?? weeklyState.syncError,
    lastUpdatedAt:
      weeklyState.lastGeneratedAt ??
      summariesState.lastSyncedAt ??
      dashboard.generatedAt,
    refresh,
  };
}
