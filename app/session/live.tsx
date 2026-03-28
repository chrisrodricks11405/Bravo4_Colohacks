import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Clipboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Audio } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StateScreen } from "../../src/components/app/StateScreen";
import {
  AIReteachPanel,
  AIInsightStrip,
  ConfusionSparkline,
  InterventionActionPanel,
  InterventionHistoryPanel,
  MetricCard,
  MisconceptionClusterDrawer,
  PulseBar,
  QuickPollPanel,
} from "../../src/components/live";
import { Badge, BottomSheet, Button, Card, StatusChip } from "../../src/components/ui";
import { useLiveDashboard } from "../../src/hooks/useLiveDashboard";
import { useLivePolls } from "../../src/hooks/useLivePolls";
import { useAudioPlayback } from "../../src/hooks/useAudioPlayback";
import { Sentry } from "../../src/lib/monitoring";
import { hasSupabaseConfig } from "../../src/lib/supabase";
import { useSessionHydration } from "../../src/providers";
import { aiProvider, getPersistedSession, voiceProvider } from "../../src/services";
import { startAudioRecording, stopAudioRecording } from "../../src/services/audioSession";
import { useNetworkStore, usePreferencesStore, useSessionStore } from "../../src/stores";
import { useShallow } from "zustand/react/shallow";
import type {
  AIQuickPollSuggestion,
  ClusterStatus,
  ConfusionTrendPoint,
  InterventionType,
  LessonMarkerType,
  MisconceptionClusterSummary,
  QuickPollPayload,
  ReteachPack,
  SessionMeta,
} from "../../src/types";
import {
  borderRadius,
  colors,
  shadows,
  spacing,
  textStyles,
} from "../../src/theme";

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatClockTime(value?: string) {
  if (!value) {
    return "Not marked yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMarkerType(type: LessonMarkerType) {
  switch (type) {
    case "new_concept":
      return "New concept";
    case "example":
      return "Example";
    case "practice":
      return "Practice";
    case "review":
      return "Review";
    case "question_time":
      return "Q&A";
    default:
      return "Marker";
  }
}

function buildClusterContext(
  cluster: MisconceptionClusterSummary,
  session: SessionMeta
) {
  return {
    clusterId: cluster.id,
    title: cluster.title,
    summary: cluster.summary,
    representativeQuestion: cluster.representativeQuestion,
    topic: session.topic,
    subject: session.subject,
    language: session.language,
    affectedCount: cluster.affectedCount,
    reasonChip: cluster.reasonChip,
    translation: cluster.translation,
    suggestedInterventions: cluster.suggestedInterventions,
  };
}

function toDraftOptions(options: QuickPollPayload["options"]) {
  return options
    .slice(0, 4)
    .sort((left, right) => left.index - right.index)
    .map((option) => option.text);
}

function getInitialPollComposerState() {
  return {
    editingDraftId: null as string | null,
    question: "",
    options: ["", ""],
    source: "manual" as QuickPollPayload["source"],
    rationale: undefined as string | undefined,
    clusterId: undefined as string | undefined,
    clusterTitle: undefined as string | undefined,
    voiceTranscript: "",
  };
}

function buildDraftInputFromSuggestion(args: {
  suggestion: AIQuickPollSuggestion;
  cluster?: MisconceptionClusterSummary | null;
  transcript?: string;
}) {
  const { cluster, suggestion, transcript } = args;

  return {
    question: suggestion.question,
    options: suggestion.options.slice(0, 4),
    source: "ai_generated" as const,
    correctOptionIndex: suggestion.correctIndex,
    rationale: suggestion.rationale,
    clusterId: cluster?.id,
    clusterTitle: cluster?.title,
    voiceTranscript: transcript ?? "",
  };
}

function getTrendDelta(trend: ConfusionTrendPoint[]) {
  if (trend.length < 2) {
    return 0;
  }

  const recentWindow = trend.slice(-4);
  return recentWindow[recentWindow.length - 1].confusionIndex - recentWindow[0].confusionIndex;
}

function getInsightModel(args: {
  activeCluster: MisconceptionClusterSummary | null;
  clusters: MisconceptionClusterSummary[];
  confusionTrend: ConfusionTrendPoint[];
  confusionIndex: number;
  threshold: number;
}) {
  const { activeCluster, clusters, confusionTrend, confusionIndex, threshold } = args;
  const trendDelta = getTrendDelta(confusionTrend);

  if (trendDelta >= 8 && activeCluster) {
    return {
      tone: "warning" as const,
      title: "Confusion rising",
      message: `${activeCluster.affectedCount} students are clustering around ${activeCluster.title.toLowerCase()}. This is a good moment for a short reset or quick poll.`,
      primaryLabel: "Run quick poll",
      secondaryLabel: "Open clusters",
    };
  }

  if (activeCluster?.reasonChip === "language_friction") {
    return {
      tone: "info" as const,
      title: "Most doubts relate to language",
      message: `${activeCluster.affectedCount} students are showing language friction in ${activeCluster.title.toLowerCase()}. A bilingual explanation may clear this quickly.`,
      primaryLabel: "Generate explanation",
      secondaryLabel: "Open clusters",
    };
  }

  if (activeCluster) {
    return {
      tone: "action" as const,
      title: `Most doubts relate to ${activeCluster.title}`,
      message: `${clusters.length} grouped clusters are live. Start with the representative question, then decide whether to acknowledge, dismiss, or act.`,
      primaryLabel: "Open clusters",
      secondaryLabel: "Run quick poll",
    };
  }

  if (confusionIndex >= Math.max(threshold - 10, 24)) {
    return {
      tone: "warning" as const,
      title: "Pulse softening",
      message: "Comprehension is dipping, but no question cluster is dominant yet. Watch for a fresh misconception wave.",
      primaryLabel: "Mark segment",
    };
  }

  return {
    tone: "neutral" as const,
    title: "Question clustering is standing by",
    message: "New anonymous doubts will group into misconception cards here as students ask them.",
    primaryLabel: "Open clusters",
  };
}

function getRemoteStatusMeta(
  remoteState: "live" | "connecting" | "degraded" | "disabled",
  mode: SessionMeta["mode"]
) {
  if (mode === "offline") {
    return {
      chipStatus: "offline" as const,
      label: "Local hotspot",
      badgeVariant: "warning" as const,
      badgeLabel: "Realtime off",
    };
  }

  switch (remoteState) {
    case "live":
      return {
        chipStatus: "available" as const,
        label: "Realtime live",
        badgeVariant: "success" as const,
        badgeLabel: "Supabase synced",
      };
    case "connecting":
      return {
        chipStatus: "syncing" as const,
        label: "Connecting",
        badgeVariant: "info" as const,
        badgeLabel: "Joining stream",
      };
    case "disabled":
      return {
        chipStatus: "offline" as const,
        label: "Local only",
        badgeVariant: "neutral" as const,
        badgeLabel: "Realtime off",
      };
    default:
      return {
        chipStatus: "error" as const,
        label: "Realtime degraded",
        badgeVariant: "warning" as const,
        badgeLabel: "Retrying",
      };
  }
}

function getConfusionMeta(
  confusionIndex: number,
  lostPercent: number,
  threshold: number
) {
  if (lostPercent >= threshold || confusionIndex >= threshold) {
    return {
      label: "Intervene now",
      supporting: "Confusion is above your live threshold.",
      badgeVariant: "error" as const,
      tone: styles.heroDanger,
      valueTone: styles.heroDangerValue,
    };
  }

  if (confusionIndex >= Math.max(threshold - 12, 28)) {
    return {
      label: "Watch closely",
      supporting: "Students may need an example or slower pacing.",
      badgeVariant: "warning" as const,
      tone: styles.heroWarning,
      valueTone: styles.heroWarningValue,
    };
  }

  return {
    label: "Stable",
    supporting: "Comprehension looks healthy right now.",
    badgeVariant: "success" as const,
    tone: styles.heroStable,
    valueTone: styles.heroStableValue,
  };
}

function HeaderPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.headerPill}>
      <Text style={styles.headerPillLabel}>{label}</Text>
      <Text style={styles.headerPillValue}>{value}</Text>
    </View>
  );
}

function MarkerOption({
  title,
  description,
  onPress,
}: {
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.markerOption} activeOpacity={0.8} onPress={onPress}>
      <Text style={styles.markerOptionTitle}>{title}</Text>
      <Text style={styles.markerOptionDescription}>{description}</Text>
    </TouchableOpacity>
  );
}

export default function LiveDashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const { isHydrating } = useSessionHydration();
  const persistedSession = useSessionStore((state) => state.session);
  const isClusterDrawerOpen = useSessionStore((state) => state.isClusterDrawerOpen);
  const setSession = useSessionStore((state) => state.setSession);
  const setClusterDrawerOpen = useSessionStore((state) => state.setClusterDrawerOpen);
  const isConnected = useNetworkStore((state) => state.isConnected);
  const connectionQuality = useNetworkStore((state) => state.connectionQuality);
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);
  const voiceServiceReachable = useNetworkStore((state) => state.voiceServiceReachable);
  const networkMode = useNetworkStore((state) => state.mode);
  const pendingSyncCount = useNetworkStore((state) => state.pendingSyncCount);
  const syncInProgress = useNetworkStore((state) => state.syncInProgress);
  const syncProgress = useNetworkStore((state) => state.syncProgress);
  const preferences = usePreferencesStore(useShallow((state) => ({
    aiProviderEnabled: state.aiProviderEnabled,
    defaultLanguage: state.defaultLanguage,
    ttsLocale: state.ttsLocale,
    ttsVoice: state.ttsVoice,
    voiceEnabled: state.voiceEnabled,
  })));

  const [resolvedSession, setResolvedSession] = useState<SessionMeta | null>(
    persistedSession
  );
  const [isLoading, setIsLoading] = useState(!persistedSession);
  const [isMarkerSheetOpen, setIsMarkerSheetOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selectedRecoveryWindowSeconds, setSelectedRecoveryWindowSeconds] = useState(60);

  useEffect(() => {
    const activeSessionId = getParam(sessionId);

    if (persistedSession && (!activeSessionId || persistedSession.id === activeSessionId)) {
      setResolvedSession(persistedSession);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const hydrate = async () => {
      setIsLoading(true);

      try {
        const nextSession = await getPersistedSession(activeSessionId);
        if (isMounted) {
          setResolvedSession(nextSession);
          setSession(nextSession);
        }
      } catch (error) {
        console.error("Failed to restore live session:", error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [persistedSession, sessionId, setSession]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (resolvedSession?.status === "lobby") {
      router.replace({
        pathname: "/session/lobby",
        params: { sessionId: resolvedSession.id },
      });
    }

    if (resolvedSession?.status === "ended") {
      router.replace({
        pathname: "/session/summary",
        params: { sessionId: resolvedSession.id },
      });
    }
  }, [resolvedSession?.id, resolvedSession?.status, router]);

  const realtimeEnabled =
    Boolean(hasSupabaseConfig) &&
    supabaseReachable &&
    resolvedSession?.mode !== "offline";

  const {
    activeCluster,
    changeClusterStatus,
    clusters,
    confusionTrend,
    currentPulse,
    endSession,
    error,
    interventions,
    interventionWindowStartedAt,
    isEndingSession,
    isHydrating: isDashboardHydrating,
    latestLessonMarker,
    lessonMarkers,
    logIntervention,
    markLessonSegment,
    pinnedClusterIds,
    remoteState,
    selectedCluster,
    selectCluster,
    toggleClusterPin,
  } = useLiveDashboard(
    resolvedSession,
    realtimeEnabled,
    selectedRecoveryWindowSeconds
  );

  const {
    activePoll,
    error: pollError,
    isClosing: isClosingPoll,
    isHydrating: isPollHydrating,
    isPushing: isPushingPoll,
    isSavingDraft,
    pollDistribution,
    pollHistory,
    saveDraft,
    selectPoll,
    selectedPoll,
    startPoll,
    stopPoll,
  } = useLivePolls(resolvedSession, realtimeEnabled);

  const [reteachPack, setReteachPack] = useState<ReteachPack | null>(null);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);
  const [isGeneratingAIPoll, setIsGeneratingAIPoll] = useState(false);
  const [pollComposer, setPollComposer] = useState(getInitialPollComposerState);
  const [voicePromptRecording, setVoicePromptRecording] = useState<Audio.Recording | null>(null);
  const [isRecordingVoicePrompt, setIsRecordingVoicePrompt] = useState(false);
  const [isProcessingVoicePrompt, setIsProcessingVoicePrompt] = useState(false);
  const [voicePromptError, setVoicePromptError] = useState<string | null>(null);
  const {
    isPlaying: isPlayingAudio,
    playbackError,
    play,
    stop,
  } = useAudioPlayback();

  const focusCluster = selectedCluster ?? activeCluster;
  const voiceCapabilities = voiceProvider.getCapabilities();
  const aiAvailable = Boolean(realtimeEnabled) && preferences.aiProviderEnabled;
  const voiceCaptureReady =
    preferences.voiceEnabled &&
    voiceCapabilities.transcriptionAvailable &&
    voiceServiceReachable;
  const voiceToPollEnabled = voiceCaptureReady && preferences.aiProviderEnabled;
  const voiceTtsReady =
    preferences.voiceEnabled &&
    voiceCapabilities.speechGenerationAvailable &&
    voiceServiceReachable;
  const pendingInterventionCount = interventions.filter(
    (intervention) => intervention.confusionAfter == null
  ).length;

  const isBusy =
    isHydrating || isLoading || isDashboardHydrating || isPollHydrating;

  const totalJoined = currentPulse
    ? currentPulse.totalActive + currentPulse.disconnectedCount
    : resolvedSession?.participantCount ?? 0;
  const confusionIndex = currentPulse?.confusionIndex ?? 0;
  const lostPercent =
    currentPulse && currentPulse.totalActive > 0
      ? (currentPulse.lostCount / currentPulse.totalActive) * 100
      : 0;
  const confusionMeta = getConfusionMeta(
    confusionIndex,
    lostPercent,
    resolvedSession?.lostThreshold ?? 40
  );

  const sessionStart = resolvedSession?.startedAt ?? resolvedSession?.createdAt;
  const sessionTimer = formatDuration(now - new Date(sessionStart ?? now).getTime());
  const interventionTimer = interventionWindowStartedAt
    ? formatDuration(now - new Date(interventionWindowStartedAt).getTime())
    : "00:00";
  const resolvedVoiceLocale =
    preferences.ttsLocale || resolvedSession?.language || preferences.defaultLanguage || "en-US";
  const remoteMeta = resolvedSession
    ? getRemoteStatusMeta(remoteState, resolvedSession.mode)
    : null;

  const isCompact = width < 1280;
  const isTight = width < 980;
  const insightModel = getInsightModel({
    activeCluster,
    clusters,
    confusionTrend,
    confusionIndex,
    threshold: resolvedSession?.lostThreshold ?? 40,
  });

  const updateComposer = (
    nextValue:
      | ReturnType<typeof getInitialPollComposerState>
      | ((
          currentValue: ReturnType<typeof getInitialPollComposerState>
        ) => ReturnType<typeof getInitialPollComposerState>)
  ) => {
    setPollComposer(nextValue);
  };

  const summaryCards = useMemo(
    () => [
      {
        label: "Got It",
        value: String(currentPulse?.gotItCount ?? 0),
        accentColor: colors.pulse.gotIt,
        supporting: "Confident responses",
      },
      {
        label: "Sort Of",
        value: String(currentPulse?.sortOfCount ?? 0),
        accentColor: colors.pulse.sortOf,
        supporting: "Need a little more",
      },
      {
        label: "Lost",
        value: String(currentPulse?.lostCount ?? 0),
        accentColor: colors.pulse.lost,
        supporting: "High-support students",
      },
      {
        label: "Active",
        value: String(currentPulse?.totalActive ?? resolvedSession?.participantCount ?? 0),
        accentColor: colors.primary[600],
        supporting: "Students currently connected",
      },
      {
        label: "Disconnected",
        value: String(currentPulse?.disconnectedCount ?? 0),
        accentColor: colors.text.tertiary,
        supporting: "Need reconnect support",
      },
    ],
    [currentPulse, resolvedSession?.participantCount]
  );

  useEffect(() => {
    setReteachPack(null);
  }, [focusCluster?.id]);

  useEffect(() => {
    return () => {
      if (voicePromptRecording) {
        void voicePromptRecording.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, [voicePromptRecording]);

  useEffect(() => {
    if (playbackError) {
      Alert.alert("Audio playback issue", playbackError);
    }
  }, [playbackError]);

  const resetPollComposer = () => {
    setVoicePromptError(null);
    updateComposer(getInitialPollComposerState());
  };

  const loadDraftIntoComposer = (poll: QuickPollPayload) => {
    setVoicePromptError(null);
    updateComposer({
      editingDraftId: poll.id,
      question: poll.question,
      options: toDraftOptions(poll.options),
      source: poll.source,
      rationale: poll.rationale,
      clusterId: poll.clusterId,
      clusterTitle: poll.clusterTitle,
      voiceTranscript: "",
    });
  };

  const handleCopyReteachCard = (label: string, text: string) => {
    try {
      Clipboard.setString(text);
      Alert.alert("Copied", `${label} copied to the clipboard.`);
    } catch (copyError) {
      Alert.alert(
        "Could not copy",
        copyError instanceof Error ? copyError.message : "Try again in a moment."
      );
    }
  };

  const resolveInsightAction = (label?: string) => {
    switch (label) {
      case "Run quick poll":
        return () => handlePollPress(activeCluster);
      case "Generate explanation":
        return () => handleExplanationPress(activeCluster);
      case "Mark segment":
        return () => setIsMarkerSheetOpen(true);
      case "Open clusters":
        return () => handleOpenClusters(activeCluster);
      default:
        return undefined;
    }
  };

  if (isBusy) {
    return (
      <StateScreen
        title="Opening live dashboard"
        message="Restoring the session, pulse cache, and realtime classroom feed."
        loading
      />
    );
  }

  if (!resolvedSession) {
    return (
      <StateScreen
        title="No live session"
        message="Start a session first, then begin class from the lobby."
      />
    );
  }

  const handleMarkerPress = async (type: LessonMarkerType) => {
    try {
      await markLessonSegment(type);
      setIsMarkerSheetOpen(false);
    } catch (actionError) {
      Alert.alert(
        "Could not save marker",
        actionError instanceof Error ? actionError.message : "Try again in a moment."
      );
    }
  };

  const handleOpenClusters = (cluster?: MisconceptionClusterSummary | null) => {
    if (cluster) {
      selectCluster(cluster.id);
    }

    setClusterDrawerOpen(true);
  };

  const handleManualIntervention = (type: InterventionType) => {
    void (async () => {
      try {
        await logIntervention(type, {
          clusterId: focusCluster?.id,
          lessonMarkerId: focusCluster?.lessonMarkerId ?? latestLessonMarker?.id,
          recoveryWindowSeconds: selectedRecoveryWindowSeconds,
        });
      } catch (actionError) {
        Alert.alert(
          "Could not log intervention",
          actionError instanceof Error ? actionError.message : "Try again in a moment."
        );
      }
    })();
  };

  const handleExplanationPress = (clusterOverride?: MisconceptionClusterSummary | null) => {
    void (async () => {
      if (!aiAvailable) {
        Alert.alert(
          "AI unavailable",
          preferences.aiProviderEnabled
            ? "Reconnect to Supabase Realtime to generate reteach packs."
            : "Turn AI back on in Settings to generate reteach packs."
        );
        return;
      }

      const targetCluster = clusterOverride ?? selectedCluster ?? activeCluster;

      if (!resolvedSession || !targetCluster) {
        Alert.alert(
          "No cluster selected",
          "Open the misconception drawer once a cluster appears, then generate an explanation from there."
        );
        return;
      }

      try {
        setIsGeneratingPack(true);
        const pack = await aiProvider.generateReteachPack(
          buildClusterContext(targetCluster, resolvedSession)
        );

        setReteachPack(pack);
      } catch (actionError) {
        Alert.alert(
          "Could not generate reteach pack",
          actionError instanceof Error ? actionError.message : "Try again in a moment."
        );
      } finally {
        setIsGeneratingPack(false);
      }
    })();
  };

  const handleSpeakReteachCard = (label: string, text: string) => {
    void (async () => {
      if (!voiceTtsReady) {
        Alert.alert(
          "Voice unavailable",
          "Turn on voice tools and reconnect to the voice provider to read explanations aloud."
        );
        return;
      }

      try {
        const spokenExplanation = await voiceProvider.generateSpokenExplanation(
          text,
          resolvedVoiceLocale,
          {
            voice: preferences.ttsVoice,
          }
        );

        await play(spokenExplanation.uri);
      } catch (actionError) {
        Alert.alert(
          `Could not play ${label.toLowerCase()}`,
          actionError instanceof Error ? actionError.message : "Try again in a moment."
        );
      }
    })();
  };

  const handlePollPress = (clusterOverride?: MisconceptionClusterSummary | null) => {
    void (async () => {
      if (!aiAvailable) {
        Alert.alert(
          "AI unavailable",
          preferences.aiProviderEnabled
            ? "Reconnect to Supabase Realtime to generate a poll from the cluster. Manual poll creation still works."
            : "Turn AI back on in Settings to generate cluster-based poll drafts."
        );
        return;
      }

      const targetCluster = clusterOverride ?? selectedCluster ?? activeCluster;

      if (!resolvedSession || !targetCluster) {
        Alert.alert(
          "No cluster selected",
          "A quick poll works best once a misconception cluster has formed."
        );
        return;
      }

      try {
        setIsGeneratingAIPoll(true);
        const pollSuggestion = await aiProvider.generateQuickPoll(
          buildClusterContext(targetCluster, resolvedSession)
        );

        const nextDraft = buildDraftInputFromSuggestion({
          suggestion: pollSuggestion,
          cluster: targetCluster,
        });

        updateComposer({
          editingDraftId: null,
          question: nextDraft.question,
          options: nextDraft.options,
          source: nextDraft.source,
          rationale: nextDraft.rationale,
          clusterId: nextDraft.clusterId,
          clusterTitle: nextDraft.clusterTitle,
          voiceTranscript: "",
        });
      } catch (actionError) {
        Alert.alert(
          "Could not generate poll",
          actionError instanceof Error ? actionError.message : "Try again in a moment."
        );
      } finally {
        setIsGeneratingAIPoll(false);
      }
    })();
  };

  const handleStartVoicePrompt = () => {
    void (async () => {
      if (!voiceToPollEnabled) {
        Alert.alert(
          "Voice to poll unavailable",
          "Turn on AI and voice tools, then reconnect to the voice provider to structure spoken questions into polls."
        );
        return;
      }

      try {
        setVoicePromptError(null);
        const recording = await startAudioRecording();
        setVoicePromptRecording(recording);
        setIsRecordingVoicePrompt(true);
      } catch (actionError) {
        setVoicePromptError(
          actionError instanceof Error
            ? actionError.message
            : "Voice recording could not start."
        );
      }
    })();
  };

  const handleStopVoicePrompt = () => {
    void (async () => {
      if (!voicePromptRecording || !resolvedSession) {
        return;
      }

      setIsRecordingVoicePrompt(false);
      setIsProcessingVoicePrompt(true);
      setVoicePromptError(null);

      const activeRecording = voicePromptRecording;
      setVoicePromptRecording(null);

      try {
        const audioUri = await stopAudioRecording(activeRecording);
        const transcript = await voiceProvider.transcribeTeacherVoicePrompt(audioUri, {
          locale: resolvedVoiceLocale,
          hint: `Short classroom poll prompt for ${resolvedSession.subject} about ${resolvedSession.topic}.`,
        });
        const pollSuggestion = await aiProvider.generateTeacherVoicePoll(transcript, {
          subject: resolvedSession.subject,
          topic: resolvedSession.topic,
          language: resolvedSession.language,
          gradeClass: resolvedSession.gradeClass,
        });
        const nextDraft = buildDraftInputFromSuggestion({
          suggestion: pollSuggestion,
          transcript,
        });

        updateComposer({
          editingDraftId: null,
          question: nextDraft.question,
          options: nextDraft.options,
          source: nextDraft.source,
          rationale: nextDraft.rationale,
          clusterId: nextDraft.clusterId,
          clusterTitle: nextDraft.clusterTitle,
          voiceTranscript: nextDraft.voiceTranscript,
        });
      } catch (actionError) {
        setVoicePromptError(
          actionError instanceof Error
            ? actionError.message
            : "We could not convert that recording into a poll draft."
        );
      } finally {
        setIsProcessingVoicePrompt(false);
      }
    })();
  };

  const handleSaveDraft = () => {
    void (async () => {
      try {
        const savedDraft = await saveDraft(
          {
            question: pollComposer.question,
            options: pollComposer.options,
            source: pollComposer.source,
            rationale: pollComposer.rationale,
            clusterId: pollComposer.clusterId,
            clusterTitle: pollComposer.clusterTitle,
          },
          pollComposer.editingDraftId
        );
        loadDraftIntoComposer(savedDraft);
      } catch (actionError) {
        Alert.alert(
          "Could not save poll draft",
          actionError instanceof Error ? actionError.message : "Try again in a moment."
        );
      }
    })();
  };

  const handlePushDraft = () => {
    void (async () => {
      try {
        const draftPoll =
          pollComposer.editingDraftId != null
            ? await saveDraft(
                {
                  question: pollComposer.question,
                  options: pollComposer.options,
                  source: pollComposer.source,
                  rationale: pollComposer.rationale,
                  clusterId: pollComposer.clusterId,
                  clusterTitle: pollComposer.clusterTitle,
                },
                pollComposer.editingDraftId
              )
            : await saveDraft({
                question: pollComposer.question,
                options: pollComposer.options,
                source: pollComposer.source,
                rationale: pollComposer.rationale,
                clusterId: pollComposer.clusterId,
                clusterTitle: pollComposer.clusterTitle,
              });

        await startPoll(draftPoll.id);
        resetPollComposer();
      } catch (actionError) {
        Alert.alert(
          "Could not push poll",
          actionError instanceof Error ? actionError.message : "Try again in a moment."
        );
      }
    })();
  };

  const handleClosePoll = () => {
    void (async () => {
      if (!selectedPoll) {
        return;
      }

      try {
        await stopPoll(selectedPoll.id);
      } catch (actionError) {
        Alert.alert(
          "Could not close poll",
          actionError instanceof Error ? actionError.message : "Try again in a moment."
        );
      }
    })();
  };

  const handleQuestionChange = (nextValue: string) => {
    updateComposer((currentValue) => ({
      ...currentValue,
      question: nextValue,
    }));
  };

  const handleOptionChange = (index: number, nextValue: string) => {
    updateComposer((currentValue) => ({
      ...currentValue,
      options: currentValue.options.map((option, optionIndex) =>
        optionIndex === index ? nextValue : option
      ),
    }));
  };

  const handleAddOption = () => {
    updateComposer((currentValue) => {
      if (currentValue.options.length >= 4) {
        return currentValue;
      }

      return {
        ...currentValue,
        options: [...currentValue.options, ""],
      };
    });
  };

  const handleRemoveOption = (index: number) => {
    updateComposer((currentValue) => {
      if (currentValue.options.length <= 2) {
        return currentValue;
      }

      return {
        ...currentValue,
        options: currentValue.options.filter((_, optionIndex) => optionIndex !== index),
      };
    });
  };

  const handleLoadDraft = (pollId: string) => {
    const draftPoll = pollHistory.find((poll) => poll.id === pollId);

    if (!draftPoll) {
      Alert.alert("Draft not found", "Try refreshing the poll history and try again.");
      return;
    }

    selectPoll(pollId);
    loadDraftIntoComposer(draftPoll);
  };

  const handleClusterStatusChange = (
    clusterId: string,
    status: ClusterStatus
  ) => {
    void (async () => {
      if (status === "active") {
        return;
      }

      try {
        await changeClusterStatus(clusterId, status);
      } catch (actionError) {
        Alert.alert(
          "Could not update cluster",
          actionError instanceof Error ? actionError.message : "Try again in a moment."
        );
      }
    })();
  };

  const handleEndSession = () => {
    Alert.alert(
      "End session?",
      "This stops live monitoring and sends you to the session summary screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Session",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                const nextSession = await endSession();
                router.replace({
                  pathname: "/session/summary",
                  params: { sessionId: nextSession.id },
                });
              } catch (actionError) {
                Alert.alert(
                  "Could not end session",
                  actionError instanceof Error
                    ? actionError.message
                    : "Try again in a moment."
                );
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Sentry.TimeToInitialDisplay record />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, isTight && styles.headerTight]}>
          <View style={styles.headerCopy}>
            <Badge
              label={resolvedSession.status === "active" ? "Class live" : "Dashboard ready"}
              variant={resolvedSession.status === "active" ? "success" : "info"}
              size="md"
              style={styles.headerBadge}
            />
            <Text style={styles.title}>Live Classroom Radar</Text>
            <Text style={styles.subtitle}>
              {resolvedSession.subject} · {resolvedSession.topic} · {resolvedSession.gradeClass} ·{" "}
              {resolvedSession.language}
            </Text>
          </View>

          <View style={styles.headerControls}>
            {remoteMeta ? (
              <>
                <StatusChip status={remoteMeta.chipStatus} label={remoteMeta.label} />
                <Badge label={remoteMeta.badgeLabel} variant={remoteMeta.badgeVariant} size="md" />
                {(networkMode !== "online" || pendingSyncCount > 0 || syncInProgress) ? (
                  <Badge
                    label={
                      syncInProgress
                        ? `Syncing ${syncProgress}%`
                        : pendingSyncCount > 0
                          ? `${pendingSyncCount} queued`
                          : networkMode === "local_hotspot"
                            ? "Local hotspot"
                            : "Offline"
                    }
                    variant={
                      syncInProgress
                        ? "info"
                        : pendingSyncCount > 0 || networkMode !== "online"
                          ? "warning"
                          : "success"
                    }
                    size="md"
                  />
                ) : null}
              </>
            ) : null}
            <HeaderPill label="Session timer" value={sessionTimer} />
            <HeaderPill label="Join code" value={resolvedSession.joinCode} />
            <HeaderPill label="Connection" value={connectionQuality} />
            <Button
              title="End Session"
              onPress={handleEndSession}
              variant="danger"
              loading={isEndingSession}
              style={styles.endButton}
            />
          </View>
        </View>

        {error ? (
          <Card variant="default" padding="lg" style={styles.alertCard}>
            <Text style={styles.alertTitle}>Live feed needs attention</Text>
            <Text style={styles.alertText}>{error}</Text>
          </Card>
        ) : null}

        {pollError ? (
          <Card variant="default" padding="lg" style={styles.alertCard}>
            <Text style={styles.alertTitle}>Poll sync needs attention</Text>
            <Text style={styles.alertText}>{pollError}</Text>
          </Card>
        ) : null}

        {!hasSupabaseConfig ? (
          <Card variant="default" padding="lg" style={styles.alertCard}>
            <Text style={styles.alertTitle}>Supabase is not configured</Text>
            <Text style={styles.alertText}>
              The dashboard is ready, but live pulse transport will stay in local-only mode until the project has valid Supabase keys and table names.
            </Text>
          </Card>
        ) : null}

        <AIInsightStrip
          title={insightModel.title}
          message={insightModel.message}
          tone={insightModel.tone}
          chipLabel="Zone D"
          primaryAction={
            insightModel.primaryLabel
              ? {
                  label: insightModel.primaryLabel,
                  onPress:
                    resolveInsightAction(insightModel.primaryLabel) ??
                    (() => undefined),
                }
              : undefined
          }
          secondaryAction={
            insightModel.secondaryLabel
              ? {
                  label: insightModel.secondaryLabel,
                  onPress:
                    resolveInsightAction(insightModel.secondaryLabel) ??
                    (() => undefined),
                  variant: "ghost",
                }
              : undefined
          }
        />

        <View style={[styles.primaryGrid, isCompact && styles.primaryGridCompact]}>
          <Card variant="elevated" padding="lg" style={styles.pulseCard}>
            <PulseBar snapshot={currentPulse} />
          </Card>

          <Card variant="default" padding="lg" style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Numeric Summary</Text>
            <Text style={styles.sectionDescription}>
              Large live counts keep the room readable at a glance.
            </Text>
            <View style={styles.metricGrid}>
              {summaryCards.map((card) => (
                <MetricCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  accentColor={card.accentColor}
                  supporting={card.supporting}
                />
              ))}
            </View>
          </Card>
        </View>

        <View style={[styles.secondaryGrid, isCompact && styles.secondaryGridCompact]}>
          <Card variant="default" padding="lg" style={styles.trendCard}>
            <ConfusionSparkline
              trend={confusionTrend}
              interventions={interventions}
              lessonMarkers={lessonMarkers}
              attentionThreshold={resolvedSession.lostThreshold}
            />
          </Card>

          <View style={styles.sideRail}>
            <Card
              variant="elevated"
              padding="lg"
              style={StyleSheet.compose(styles.heroCard, confusionMeta.tone)}
            >
              <View style={styles.heroHeader}>
                <Text style={styles.heroKicker}>Current Read</Text>
                <Badge
                  label={confusionMeta.label}
                  variant={confusionMeta.badgeVariant}
                  size="md"
                />
              </View>
              <Text style={[styles.heroValue, confusionMeta.valueTone]}>
                {confusionIndex.toFixed(1)}
              </Text>
              <Text style={styles.heroLabel}>Confusion Index</Text>
              <Text style={styles.heroSupporting}>{confusionMeta.supporting}</Text>

              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>Lost share</Text>
                  <Text style={styles.heroStatValue}>{lostPercent.toFixed(1)}%</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>Connected</Text>
                  <Text style={styles.heroStatValue}>{totalJoined}</Text>
                </View>
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.clusterCard}>
              <View style={styles.clusterHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Question Cluster Radar</Text>
                  <Text style={styles.sectionDescription}>
                    Keep the current lesson marker and grouped misconceptions within one glance.
                  </Text>
                </View>
                <Badge
                  label={clusters.length > 0 ? `${clusters.length} live` : "No cluster"}
                  variant={clusters.length > 0 ? "warning" : "neutral"}
                  size="md"
                />
              </View>

              <View style={styles.watchBlock}>
                <Text style={styles.watchLabel}>Latest lesson marker</Text>
                <Text style={styles.watchValue}>
                  {latestLessonMarker
                    ? formatMarkerType(latestLessonMarker.type)
                    : "No marker yet"}
                </Text>
                <Text style={styles.watchSupporting}>
                  {latestLessonMarker
                    ? `Logged at ${formatClockTime(latestLessonMarker.timestamp)}`
                    : "Tap Mark topic/segment to stamp the confusion timeline."}
                </Text>
              </View>

              <View style={styles.watchBlock}>
                <Text style={styles.watchLabel}>Focused cluster</Text>
                <Text style={styles.watchValue}>
                  {selectedCluster?.title ??
                    activeCluster?.title ??
                    "Cluster pipeline standing by"}
                </Text>
                <Text style={styles.watchSupporting}>
                  {selectedCluster || activeCluster
                    ? `${(selectedCluster ?? activeCluster)?.affectedCount ?? 0} students · ${
                        (selectedCluster ?? activeCluster)?.summary ?? ""
                      }`
                    : "New doubts will group into actionable cards and open in the Zone E drawer."}
                </Text>
              </View>

              <View style={styles.clusterActionRow}>
                <Button
                  title="Open Cluster Drawer"
                  onPress={() => handleOpenClusters(selectedCluster ?? activeCluster)}
                  variant="primary"
                  size="md"
                  style={styles.clusterActionPrimary}
                />
                <Button
                  title={
                    activeCluster && pinnedClusterIds.includes(activeCluster.id)
                      ? "Unpin Focus Cluster"
                      : "Pin Focus Cluster"
                  }
                  onPress={() => {
                    if (activeCluster) {
                      toggleClusterPin(activeCluster.id);
                    }
                  }}
                  variant="outline"
                  size="md"
                  disabled={!activeCluster}
                  style={styles.clusterActionSecondary}
                />
                <Button
                  title="Acknowledge Cluster"
                  onPress={() => {
                    if (activeCluster) {
                      handleClusterStatusChange(activeCluster.id, "acknowledged");
                    }
                  }}
                  variant="ghost"
                  size="md"
                  disabled={!activeCluster}
                  style={styles.clusterActionSecondary}
                />
              </View>
            </Card>
          </View>
        </View>

        <Card variant="default" padding="lg" style={styles.actionsCard}>
          <View style={styles.actionsHeader}>
            <View>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <Text style={styles.sectionDescription}>
                Mark the lesson, generate support, and keep your live teaching tools close by.
              </Text>
            </View>
            <View style={styles.timerBadge}>
              <Text style={styles.timerBadgeLabel}>Intervention timer</Text>
              <Text style={styles.timerBadgeValue}>{interventionTimer}</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Button
              title="Mark Topic / Segment"
              onPress={() => setIsMarkerSheetOpen(true)}
              size="lg"
              style={styles.actionButton}
            />
            <Button
              title="Generate Explanation"
              onPress={() => handleExplanationPress()}
              variant="secondary"
              size="lg"
              disabled={!aiAvailable || (!selectedCluster && !activeCluster)}
              style={styles.actionButton}
            />
            <Button
              title="Generate Poll"
              onPress={() => handlePollPress()}
              variant="outline"
              size="lg"
              disabled={!aiAvailable || (!selectedCluster && !activeCluster)}
              style={styles.actionButton}
            />
            <Button
              title="Open Cluster Drawer"
              onPress={() => handleOpenClusters(selectedCluster ?? activeCluster)}
              variant="ghost"
              size="lg"
              style={styles.actionButton}
            />
          </View>
        </Card>

        <View style={[styles.interventionGrid, isCompact && styles.interventionGridCompact]}>
          <InterventionActionPanel
            activeClusterTitle={focusCluster?.title}
            pendingCount={pendingInterventionCount}
            recoveryWindowSeconds={selectedRecoveryWindowSeconds}
            onRunIntervention={handleManualIntervention}
            onSelectRecoveryWindow={setSelectedRecoveryWindowSeconds}
          />

          <InterventionHistoryPanel
            clusters={clusters}
            interventions={interventions}
          />
        </View>

        <AIReteachPanel
          clusterTitle={focusCluster?.title}
          representativeQuestion={focusCluster?.representativeQuestion}
          pack={reteachPack}
          isAvailable={aiAvailable}
          isLoading={isGeneratingPack}
          voiceAvailable={voiceTtsReady}
          isSpeaking={isPlayingAudio}
          onGenerate={() => handleExplanationPress(focusCluster)}
          onCopy={handleCopyReteachCard}
          onSpeak={handleSpeakReteachCard}
          onStopSpeaking={stop}
        />

        <QuickPollPanel
          activePoll={activePoll}
          aiAvailable={aiAvailable}
          canGenerateFromCluster={Boolean(focusCluster)}
          clusterTitle={focusCluster?.title}
          draftQuestion={pollComposer.question}
          draftOptions={pollComposer.options}
          editingDraftId={pollComposer.editingDraftId}
          editingSource={pollComposer.source}
          isClosing={isClosingPoll}
          isGeneratingAI={isGeneratingAIPoll}
          isProcessingVoicePrompt={isProcessingVoicePrompt}
          isPushing={isPushingPoll}
          isRecordingVoicePrompt={isRecordingVoicePrompt}
          isSavingDraft={isSavingDraft}
          pollDistribution={pollDistribution}
          pollHistory={pollHistory}
          selectedPoll={selectedPoll}
          selectedPollId={selectedPoll?.id}
          voiceError={voicePromptError}
          voiceToPollEnabled={voiceToPollEnabled}
          voiceTranscript={pollComposer.voiceTranscript}
          onAddOption={handleAddOption}
          onChangeOption={handleOptionChange}
          onChangeQuestion={handleQuestionChange}
          onClosePoll={handleClosePoll}
          onGenerateAI={() => handlePollPress(focusCluster)}
          onLoadDraft={handleLoadDraft}
          onPushNow={handlePushDraft}
          onRemoveOption={handleRemoveOption}
          onResetComposer={resetPollComposer}
          onSaveDraft={handleSaveDraft}
          onSelectPoll={selectPoll}
          onStartVoicePrompt={handleStartVoicePrompt}
          onStopVoicePrompt={handleStopVoicePrompt}
        />
      </ScrollView>

      <BottomSheet
        visible={isMarkerSheetOpen}
        onClose={() => setIsMarkerSheetOpen(false)}
        height={360}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Mark topic / segment</Text>
          <Text style={styles.sheetDescription}>
            Stamp the confusion timeline so trend spikes line up with what you were teaching.
          </Text>

          <View style={styles.markerOptions}>
            <MarkerOption
              title="New concept"
              description="Use when you introduce a fresh idea or notation."
              onPress={() => {
                void handleMarkerPress("new_concept");
              }}
            />
            <MarkerOption
              title="Example"
              description="Use when you switch into demonstration or worked examples."
              onPress={() => {
                void handleMarkerPress("example");
              }}
            />
            <MarkerOption
              title="Practice"
              description="Use when students start solving on their own or in pairs."
              onPress={() => {
                void handleMarkerPress("practice");
              }}
            />
          </View>

          <Button
            title="Close"
            onPress={() => setIsMarkerSheetOpen(false)}
            variant="outline"
            size="lg"
            style={styles.sheetCloseButton}
          />
        </View>
      </BottomSheet>

      <MisconceptionClusterDrawer
        visible={isClusterDrawerOpen}
        clusters={clusters.filter((cluster) => cluster.status !== "dismissed")}
        selectedClusterId={selectedCluster?.id}
        pinnedClusterIds={pinnedClusterIds}
        lessonMarkers={lessonMarkers}
        sessionLanguage={resolvedSession.language}
        onClose={() => setClusterDrawerOpen(false)}
        onSelectCluster={selectCluster}
        onTogglePin={toggleClusterPin}
        onChangeStatus={handleClusterStatusChange}
        onGeneratePoll={handlePollPress}
        onGenerateExplanation={handleExplanationPress}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.background,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing["3xl"],
    gap: spacing.xl,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  headerTight: {
    flexDirection: "column",
  },
  headerCopy: {
    flex: 1,
    minWidth: 320,
  },
  headerBadge: {
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
  },
  title: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    flexWrap: "wrap",
    maxWidth: 640,
  },
  headerPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.backgroundAlt,
    ...shadows.sm,
  },
  headerPillLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  headerPillValue: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: "700",
    marginTop: spacing.xxs,
  },
  endButton: {
    minWidth: 150,
  },

  // Alerts
  alertCard: {
    backgroundColor: colors.status.warningBg,
    borderRadius: borderRadius["2xl"],
  },
  alertTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  alertText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },

  // Primary grid (Pulse + Summary)
  primaryGrid: {
    flexDirection: "row",
    gap: spacing.xl,
    alignItems: "stretch",
  },
  primaryGridCompact: {
    flexDirection: "column",
  },
  pulseCard: {
    flex: 1.2,
    minWidth: 360,
    borderRadius: borderRadius["2xl"],
  },
  summaryCard: {
    flex: 1,
    minWidth: 320,
    borderRadius: borderRadius["2xl"],
  },
  sectionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  sectionDescription: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
    marginTop: spacing.lg,
  },

  // Secondary grid (Trend + Side rail)
  secondaryGrid: {
    flexDirection: "row",
    gap: spacing.xl,
    alignItems: "stretch",
  },
  secondaryGridCompact: {
    flexDirection: "column",
  },
  trendCard: {
    flex: 1.25,
    minWidth: 360,
    borderRadius: borderRadius["2xl"],
  },
  sideRail: {
    flex: 0.9,
    minWidth: 320,
    gap: spacing.xl,
  },

  // Hero confusion card
  heroCard: {
    minHeight: 260,
    borderRadius: borderRadius["2xl"],
  },
  heroStable: {
    backgroundColor: "#ECFDF5",
  },
  heroStableValue: {
    color: "#065F46",
  },
  heroWarning: {
    backgroundColor: "#FFFBEB",
  },
  heroWarningValue: {
    color: "#92400E",
  },
  heroDanger: {
    backgroundColor: "#FEF2F2",
  },
  heroDangerValue: {
    color: "#991B1B",
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "center",
  },
  heroKicker: {
    ...textStyles.label,
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },
  heroValue: {
    ...textStyles.metric,
    marginTop: spacing.xl,
  },
  heroLabel: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  heroSupporting: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  heroStats: {
    flexDirection: "row",
    gap: spacing.base,
    marginTop: spacing.xl,
  },
  heroStat: {
    flex: 1,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: "rgba(255, 255, 255, 0.72)",
  },
  heroStatLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroStatValue: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },

  // Cluster radar card
  clusterCard: {
    gap: spacing.lg,
    borderRadius: borderRadius["2xl"],
  },
  clusterHeader: {
    gap: spacing.base,
  },
  watchBlock: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
  },
  watchLabel: {
    ...textStyles.label,
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },
  watchValue: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  watchSupporting: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  clusterActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  clusterActionPrimary: {
    minWidth: 180,
  },
  clusterActionSecondary: {
    minWidth: 156,
  },

  // Quick actions card
  actionsCard: {
    gap: spacing.lg,
    borderRadius: borderRadius["2xl"],
  },
  actionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    flexWrap: "wrap",
  },
  timerBadge: {
    minWidth: 168,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.dark.surface,
    ...shadows.md,
  },
  timerBadgeLabel: {
    ...textStyles.caption,
    color: colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  timerBadgeValue: {
    ...textStyles.headingMedium,
    color: colors.dark.text,
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  actionButton: {
    minWidth: 210,
  },

  // Intervention grid
  interventionGrid: {
    flexDirection: "row",
    gap: spacing.xl,
    alignItems: "stretch",
  },
  interventionGridCompact: {
    flexDirection: "column",
  },

  // Bottom sheet
  sheetContent: {
    flex: 1,
  },
  sheetTitle: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  sheetDescription: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  markerOptions: {
    marginTop: spacing.xl,
    gap: spacing.base,
  },
  markerOption: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
    ...shadows.sm,
  },
  markerOptionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  markerOptionDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  sheetCloseButton: {
    marginTop: "auto",
  },
});
