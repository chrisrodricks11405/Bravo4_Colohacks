export { aiProvider, StubAIProvider } from "./ai";
export {
  isVoiceProviderConfigured,
  StubVoiceProvider,
  voiceProvider,
  VOICE_LOCALE_OPTIONS,
  VOICE_TTS_OPTIONS,
} from "./voice";
export {
  listRecentSessions,
  upsertRecentSessions,
  countPendingSyncJobs,
  syncRecentSessionsFromSupabase,
} from "./recentSessions";
export { loadTeacherPreferences, saveTeacherPreferences } from "./preferences";
export {
  getSyncQueueOverview,
  listSyncJobs,
  queueSyncJob,
} from "./syncJobs";
export {
  beginLiveSession,
  countSessionParticipants,
  createSession,
  endLiveSession,
  fetchRemoteSession,
  getPersistedSession,
  regenerateSessionJoinCode,
  subscribeToSessionLobby,
  toggleSessionLock,
  updateSession,
} from "./session";
export type { SessionChannelStatus } from "./session";
export {
  buildTrendPoint,
  computeConfusionIndex,
  computeLostPercent,
  clearCachedClusters,
  createIntervention,
  createLessonMarker,
  fetchLiveSessionSnapshot,
  listCachedClusters,
  listCachedQuestions,
  listCachedPulseSnapshots,
  listInterventions,
  listLessonMarkers,
  persistClusters,
  persistPulseSnapshot,
  recordLocalPulseEvent,
  recordLocalQuestion,
  refreshInterventions,
  refreshQuestionClusters,
  subscribeToLiveSession,
  updateIntervention,
  updateClusterStatus,
} from "./liveSession";
export type { LiveSessionChannelStatus, LiveSessionSnapshot } from "./liveSession";
export {
  closePoll,
  computePollDistribution,
  createPollDraft,
  getPollDistribution,
  listCachedPollResponses,
  listCachedPolls,
  persistPollResponses,
  persistPolls,
  pushPoll,
  recordLocalPollResponse,
  refreshPollHistory,
  refreshPollResponses,
  subscribeToPollSession,
  updatePollDraft,
} from "./polls";
export type { PollChannelStatus } from "./polls";
export {
  generateSessionSummary,
  getSessionSummary,
  listSessionSummaries,
  saveSessionSummary,
  syncSessionSummariesFromSupabase,
  updateSessionSummaryVoiceReflection,
} from "./summaries";
export {
  generateWeeklyInsightReport,
  getCachedWeeklyInsight,
  isValidDateKey,
  resolveWeeklyDateRange,
} from "./weeklyInsights";
export {
  exportSyncDiagnostics,
  retryFailedSyncJobs,
  runSyncEngine,
} from "./syncEngine";
