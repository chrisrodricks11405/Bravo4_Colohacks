import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Audio } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StateScreen } from "../../src/components/app/StateScreen";
import { SessionSummaryTimeline } from "../../src/components/summary/SessionSummaryTimeline";
import { Badge, Button, Card } from "../../src/components/ui";
import { Sentry } from "../../src/lib/monitoring";
import { hasSupabaseConfig } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers";
import {
  generateSessionSummary,
  getPersistedSession,
  getSessionSummary,
  syncSessionSummariesFromSupabase,
  aiProvider,
  updateSessionSummaryVoiceReflection,
  voiceProvider,
} from "../../src/services";
import { startAudioRecording, stopAudioRecording } from "../../src/services/audioSession";
import { useAudioPlayback } from "../../src/hooks/useAudioPlayback";
import { useNetworkStore, usePreferencesStore } from "../../src/stores";
import { useShallow } from "zustand/react/shallow";
import type { InterventionEffectiveness, SessionMeta, SessionSummaryPayload } from "../../src/types";
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

function formatSummaryDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "1 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

function formatReasonChip(chip: string) {
  switch (chip) {
    case "step_unclear":
      return "Steps unclear";
    case "language_friction":
      return "Language friction";
    case "missing_prerequisite":
      return "Missing prerequisite";
    case "too_fast":
      return "Too fast";
    case "notation_confusion":
      return "Notation confusion";
    case "example_needed":
      return "Example needed";
    default:
      return "Other";
  }
}

function formatInterventionType(type: InterventionEffectiveness["type"]) {
  switch (type) {
    case "language_switch":
      return "Language switch";
    case "board_script":
      return "Board script";
    case "bilingual_explanation":
      return "Bilingual explanation";
    default:
      return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

function getRecoveryTone(value: number) {
  if (value >= 75) {
    return {
      badgeVariant: "success" as const,
      chipLabel: "Strong recovery",
      color: colors.status.success,
      bg: colors.status.successBg,
    };
  }

  if (value >= 45) {
    return {
      badgeVariant: "warning" as const,
      chipLabel: "Partial recovery",
      color: colors.status.warning,
      bg: colors.status.warningBg,
    };
  }

  return {
    badgeVariant: "error" as const,
    chipLabel: "Needs follow-up",
    color: colors.status.error,
    bg: colors.status.errorBg,
  };
}

function SummaryMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function InsightRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.insightRow}>
      <Text style={styles.insightLabel}>{label}</Text>
      <Text style={styles.insightValue}>{value}</Text>
    </View>
  );
}

function buildReflectionContext(summary: SessionSummaryPayload) {
  return {
    subject: summary.subject,
    topic: summary.topic,
    gradeClass: summary.gradeClass,
    suggestedNextActivity: summary.suggestedNextActivity,
  };
}

export default function SessionSummaryScreen() {
  const router = useRouter();
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId?: string }>();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const isConnected = useNetworkStore((state) => state.isConnected);
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);
  const voiceServiceReachable = useNetworkStore((state) => state.voiceServiceReachable);
  const preferences = usePreferencesStore(useShallow((state) => ({
    aiProviderEnabled: state.aiProviderEnabled,
    defaultLanguage: state.defaultLanguage,
    ttsLocale: state.ttsLocale,
    ttsVoice: state.ttsVoice,
    voiceEnabled: state.voiceEnabled,
    defaultLostThreshold: state.defaultLostThreshold,
  })));

  const [summary, setSummary] = useState<SessionSummaryPayload | null>(null);
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSavingReflection, setIsSavingReflection] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const { activeUri, isPlaying, playbackError, play, stop } = useAudioPlayback();

  const sessionId = getParam(sessionIdParam);
  const isWide = width >= 980;
  const recoveryTone = getRecoveryTone(summary?.overallRecoveryScore ?? 0);
  const voiceCapabilities = voiceProvider.getCapabilities();
  const voiceCaptureReady =
    preferences.voiceEnabled &&
    voiceCapabilities.transcriptionAvailable &&
    voiceServiceReachable;
  const resolvedVoiceLocale =
    preferences.ttsLocale || sessionMeta?.language || preferences.defaultLanguage || "en-US";

  useEffect(() => {
    if (!sessionId) {
      setError("No session summary was requested.");
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadSummary = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const persistedSession = await getPersistedSession(sessionId);

        if (!isMounted) {
          return;
        }

        setSessionMeta(persistedSession);

        let storedSummary = await getSessionSummary(sessionId);

        if (
          !storedSummary &&
          user?.id &&
          supabaseReachable &&
          hasSupabaseConfig
        ) {
          await syncSessionSummariesFromSupabase(user.id, 40);
          storedSummary = await getSessionSummary(sessionId);
        }

        const nextSummary =
          storedSummary ??
          (persistedSession
            ? await generateSessionSummary(persistedSession, {
                teacherId: user?.id ?? persistedSession.teacherId,
                preferAI: preferences.aiProviderEnabled,
                attemptRemoteSync: supabaseReachable,
                queueOnFailure: true,
              })
            : null);

        if (!nextSummary) {
          throw new Error("We could not find or generate this session summary.");
        }

        if (!isMounted) {
          return;
        }

        setSummary(nextSummary);
        setTranscriptDraft(nextSummary.voiceReflectionTranscript ?? "");
        setVoiceUri(nextSummary.voiceReflectionUri ?? null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load the session summary."
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, [
    preferences.aiProviderEnabled,
    sessionId,
    supabaseReachable,
    user?.id,
  ]);

  useEffect(() => {
    return () => {
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, [recording]);

  useEffect(() => {
    if (playbackError) {
      Alert.alert("Audio playback issue", playbackError);
    }
  }, [playbackError]);

  const attentionThreshold =
    sessionMeta?.lostThreshold ?? preferences.defaultLostThreshold;

  const peakSummary = useMemo(() => {
    if (!summary || summary.peakConfusionMoments.length === 0) {
      return [];
    }

    return summary.peakConfusionMoments.map((peak) => ({
      id: peak.timestamp,
      title: peak.label ?? formatSummaryDate(peak.timestamp),
      meta: `${peak.confusionIndex.toFixed(1)} confusion${
        peak.lostPercent != null ? ` · ${peak.lostPercent.toFixed(1)}% lost` : ""
      }`,
    }));
  }, [summary]);

  const handleStartRecording = async () => {
    try {
      setVoiceError(null);
      const createdRecording = await startAudioRecording();
      setRecording(createdRecording);
      setIsRecording(true);
    } catch (recordError) {
      setVoiceError(
        recordError instanceof Error
          ? recordError.message
          : "Voice recording could not start."
      );
    }
  };

  const handleStopRecording = async () => {
    if (!recording || !summary) {
      return;
    }

    setIsRecording(false);
    setIsTranscribing(true);
    setVoiceError(null);

    const activeRecording = recording;
    setRecording(null);

    try {
      const nextVoiceUri = await stopAudioRecording(activeRecording);
      setVoiceUri(nextVoiceUri);

      let transcript = "";
      try {
        transcript = await voiceProvider.transcribeTeacherVoicePrompt(nextVoiceUri, {
          locale: resolvedVoiceLocale,
          hint: `Short post-class reflection for ${summary.subject} about ${summary.topic}.`,
        });
      } catch (transcriptionError) {
        setVoiceError(
          transcriptionError instanceof Error
            ? transcriptionError.message
            : "Automatic transcription is unavailable right now, so you can add a typed note instead."
        );
      }

      setTranscriptDraft(transcript);
      const reflectionPlan = transcript.trim()
        ? await aiProvider.structureVoiceReflection(
            transcript,
            buildReflectionContext(summary)
          )
        : {
            summary: "",
            actions: [],
            source: "fallback" as const,
          };

      const savedSummary = await updateSessionSummaryVoiceReflection({
        sessionId: summary.sessionId,
        voiceReflectionUri: nextVoiceUri,
        voiceReflectionTranscript: transcript,
        voiceReflectionSummary: reflectionPlan.summary,
        voiceReflectionActions: reflectionPlan.actions,
        voiceReflectionActionSource: reflectionPlan.source,
        attemptRemoteSync: supabaseReachable,
        queueOnFailure: true,
      });

      setSummary(savedSummary);
    } catch (recordError) {
      setVoiceError(
        recordError instanceof Error
          ? recordError.message
          : "We could not finish the voice reflection."
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSaveReflection = async () => {
    if (!summary) {
      return;
    }

    setIsSavingReflection(true);
    setVoiceError(null);

    try {
      const normalizedTranscript = transcriptDraft.trim();
      const reflectionPlan = normalizedTranscript
        ? await aiProvider.structureVoiceReflection(
            normalizedTranscript,
            buildReflectionContext(summary)
          )
        : {
            summary: "",
            actions: [],
            source: "fallback" as const,
          };
      const savedSummary = await updateSessionSummaryVoiceReflection({
        sessionId: summary.sessionId,
        voiceReflectionUri: voiceUri ?? undefined,
        voiceReflectionTranscript: normalizedTranscript,
        voiceReflectionSummary: reflectionPlan.summary,
        voiceReflectionActions: reflectionPlan.actions,
        voiceReflectionActionSource: reflectionPlan.source,
        attemptRemoteSync: supabaseReachable,
        queueOnFailure: true,
      });

      setSummary(savedSummary);
      Alert.alert("Reflection saved", "Your voice reflection was stored with this session summary.");
    } catch (saveError) {
      setVoiceError(
        saveError instanceof Error
          ? saveError.message
          : "We could not save the reflection."
      );
    } finally {
      setIsSavingReflection(false);
    }
  };

  if (isLoading) {
    return (
      <StateScreen
        title="Building session summary"
        message="Pulling the timeline, misconception clusters, and post-class insights together."
        loading
      />
    );
  }

  if (error || !summary) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Session summary unavailable</Text>
          <Text style={styles.errorText}>
            {error ?? "We could not load this summary right now."}
          </Text>
          <Button
            title="Back Home"
            onPress={() => router.replace("/(tabs)/index")}
            size="lg"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Sentry.TimeToInitialDisplay record />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <View style={styles.headerBadges}>
              <Badge
                label={summary.summarySource === "edge" ? "Edge AI summary" : "Rule-based fallback"}
                variant={summary.summarySource === "edge" ? "primary" : "warning"}
                size="md"
              />
              <Badge
                label={summary.synced ? "Saved to Supabase" : "Saved locally"}
                variant={summary.synced ? "success" : "warning"}
                size="md"
              />
              <Badge
                label={recoveryTone.chipLabel}
                variant={recoveryTone.badgeVariant}
                size="md"
              />
            </View>
            <Text style={styles.title}>Session Wrap-up</Text>
            <Text style={styles.subtitle}>
              {summary.subject} · {summary.topic} · {summary.gradeClass} ·{" "}
              {formatSummaryDate(summary.createdAt)}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Button
              title="Past Summaries"
              variant="outline"
              onPress={() => router.push("/(tabs)/summaries")}
            />
            <Button
              title="Home"
              onPress={() => router.replace("/(tabs)/index")}
            />
          </View>
        </View>

        <Card variant="elevated" padding="lg" style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>Recovery score</Text>
              <Text style={styles.heroScore}>{summary.overallRecoveryScore}</Text>
              <Text style={styles.heroDescription}>
                Peak confusion closed from {summary.peakConfusionIndex.toFixed(1)} to{" "}
                {summary.endingConfusionIndex.toFixed(1)}, while Lost moved from{" "}
                {summary.peakLostPercent.toFixed(1)}% to {summary.endingLostPercent.toFixed(1)}%.
              </Text>
            </View>

            <View style={styles.heroMetrics}>
              <SummaryMetric
                label="Duration"
                value={formatDuration(summary.duration)}
                hint="from session start to close"
              />
              <SummaryMetric
                label="Participants"
                value={`${summary.totalParticipants}`}
                hint="highest joined count captured"
              />
              <SummaryMetric
                label="Clusters"
                value={`${summary.topClusters.length}`}
                hint="top misconception groups saved"
              />
            </View>
          </View>
        </Card>

        <View style={[styles.columns, !isWide && styles.columnsStacked]}>
          <View style={styles.mainColumn}>
            <Card variant="default" padding="lg" style={styles.sectionCard}>
              <SessionSummaryTimeline
                trend={summary.comprehensionTimeline}
                lessonMarkers={summary.lessonMarkers}
                peaks={summary.peakConfusionMoments}
                attentionThreshold={attentionThreshold}
              />
            </Card>

            <Card variant="default" padding="lg" style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>AI Summary</Text>
                  <Text style={styles.sectionSubtitle}>
                    Natural-language wrap-up generated through the edge function, with a rule-based fallback when AI is unavailable.
                  </Text>
                </View>
                <Badge
                  label={summary.summarySource === "edge" ? "AI generated" : "Fallback"}
                  variant={summary.summarySource === "edge" ? "primary" : "warning"}
                  size="md"
                />
              </View>

              <Text style={styles.narrativeText}>
                {summary.aiNarrativeSummary ??
                  "Summary narrative is still being prepared for this session."}
              </Text>

              <View style={styles.nextActivityCard}>
                <Text style={styles.nextActivityLabel}>Suggested opener for next class</Text>
                <Text style={styles.nextActivityText}>
                  {summary.suggestedNextActivity ??
                    "Start with a short recap of the toughest step before introducing new material."}
                </Text>
              </View>

              {summary.dominantPollInsight ? (
                <View style={styles.pollInsightCard}>
                  <Text style={styles.pollInsightLabel}>Most selected poll response</Text>
                  <Text style={styles.pollInsightText}>
                    {summary.dominantPollInsight.leadingOptionText}
                  </Text>
                  <Text style={styles.pollInsightMeta}>
                    {summary.dominantPollInsight.leadingOptionPercent.toFixed(1)}% across{" "}
                    {summary.dominantPollInsight.totalResponses} responses
                  </Text>
                </View>
              ) : null}
            </Card>

            <Card variant="default" padding="lg" style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Voice Reflection</Text>
                  <Text style={styles.sectionSubtitle}>
                    Record an optional post-class note, review the transcript, and turn it into next-class actions.
                  </Text>
                </View>
                <Badge
                  label={voiceUri ? "Audio saved" : "Optional"}
                  variant={voiceUri ? "success" : "neutral"}
                  size="md"
                />
              </View>

              {!preferences.voiceEnabled ? (
                <View style={styles.voiceDisabledCard}>
                  <Text style={styles.voiceDisabledTitle}>Voice tools are off in settings</Text>
                  <Text style={styles.voiceDisabledText}>
                    You can still type a reflection below, or enable voice capture later in Settings.
                  </Text>
                  <Button
                    title="Open Settings"
                    variant="outline"
                    onPress={() => router.push("/(tabs)/settings")}
                  />
                </View>
              ) : !voiceCaptureReady ? (
                <View style={styles.voiceDisabledCard}>
                  <Text style={styles.voiceDisabledTitle}>Voice provider unavailable</Text>
                  <Text style={styles.voiceDisabledText}>
                    Recording controls stay hidden until transcription is reachable. Typed reflections still save and can generate next-class actions.
                  </Text>
                </View>
              ) : (
                <View style={styles.voiceActions}>
                  <Button
                    title={isRecording ? "Recording..." : "Start Recording"}
                    onPress={handleStartRecording}
                    disabled={isRecording || isTranscribing}
                    variant={isRecording ? "danger" : "primary"}
                  />
                  <Button
                    title={isTranscribing ? "Transcribing..." : "Stop & Transcribe"}
                    onPress={handleStopRecording}
                    disabled={!isRecording || isTranscribing}
                    variant="outline"
                  />
                  {voiceUri ? (
                    <Button
                      title={isPlaying && activeUri === voiceUri ? "Stop playback" : "Play recording"}
                      onPress={() =>
                        isPlaying && activeUri === voiceUri
                          ? stop()
                          : play(voiceUri)
                      }
                      variant="ghost"
                    />
                  ) : null}
                </View>
              )}

              {!voiceCaptureReady && voiceUri ? (
                <View style={styles.voiceActions}>
                  <Button
                    title={isPlaying && activeUri === voiceUri ? "Stop playback" : "Play recording"}
                    onPress={() =>
                      isPlaying && activeUri === voiceUri ? stop() : play(voiceUri)
                    }
                    variant="ghost"
                  />
                </View>
              ) : null}

              {isTranscribing ? (
                <View style={styles.transcribingRow}>
                  <ActivityIndicator color={colors.primary[600]} />
                  <Text style={styles.transcribingText}>
                    Saving the audio note and generating a transcript.
                  </Text>
                </View>
              ) : null}

              {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}

              <TextInput
                value={transcriptDraft}
                onChangeText={setTranscriptDraft}
                multiline
                placeholder="Add a quick reflection about what worked, what stayed fuzzy, or how you want to open the next class."
                placeholderTextColor={colors.text.tertiary}
                style={styles.reflectionInput}
                textAlignVertical="top"
              />

              <View style={styles.reflectionPlanCard}>
                <View style={styles.reflectionPlanHeader}>
                  <View>
                    <Text style={styles.reflectionPlanTitle}>Next-class actions</Text>
                    <Text style={styles.reflectionPlanSubtitle}>
                      Saved reflection notes are structured into a short action list for the next lesson.
                    </Text>
                  </View>
                  {summary.voiceReflectionActionSource ? (
                    <Badge
                      label={
                        summary.voiceReflectionActionSource === "edge"
                          ? "Structured by AI"
                          : "Fallback plan"
                      }
                      variant={
                        summary.voiceReflectionActionSource === "edge"
                          ? "primary"
                          : "warning"
                      }
                      size="sm"
                    />
                  ) : null}
                </View>

                {summary.voiceReflectionSummary ? (
                  <Text style={styles.reflectionPlanSummary}>
                    {summary.voiceReflectionSummary}
                  </Text>
                ) : null}

                {summary.voiceReflectionActions.length === 0 ? (
                  <Text style={styles.voiceHint}>
                    Save a reflection note to generate an action plan for the next class.
                  </Text>
                ) : (
                  <View style={styles.reflectionActionList}>
                    {summary.voiceReflectionActions.map((action, index) => (
                      <View key={action.id} style={styles.reflectionActionItem}>
                        <View style={styles.indexBubble}>
                          <Text style={styles.indexBubbleText}>{index + 1}</Text>
                        </View>
                        <View style={styles.reflectionActionCopy}>
                          <Text style={styles.reflectionActionTitle}>{action.title}</Text>
                          <Text style={styles.reflectionActionDetail}>{action.detail}</Text>
                          <Text style={styles.reflectionActionMeta}>
                            {action.timing === "opening"
                              ? "Use at the opening"
                              : action.timing === "check_in"
                                ? "Use during the first check-in"
                                : "Use as a follow-up note"}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.voiceFooter}>
                <Text style={styles.voiceHint}>
                  {voiceUri
                    ? "The latest audio note is attached to this summary. You can edit the transcript before saving again."
                    : "No audio note attached yet. Typed reflections still save normally."}
                </Text>
                <Button
                  title="Save Reflection"
                  onPress={handleSaveReflection}
                  loading={isSavingReflection}
                />
              </View>
            </Card>
          </View>

          <View style={styles.sideColumn}>
            <Card variant="default" padding="lg" style={styles.sideCard}>
              <Text style={styles.sectionTitle}>Peak Confusion Moments</Text>
              <Text style={styles.sectionSubtitle}>
                Highest confusion points across the full session timeline.
              </Text>

              {peakSummary.length === 0 ? (
                <Text style={styles.emptyText}>No strong peaks were detected in this session.</Text>
              ) : (
                <View style={styles.list}>
                  {peakSummary.map((peak, index) => (
                    <View key={peak.id} style={styles.listItem}>
                      <View style={styles.indexBubble}>
                        <Text style={styles.indexBubbleText}>{index + 1}</Text>
                      </View>
                      <View style={styles.listItemCopy}>
                        <Text style={styles.listItemTitle}>{peak.title}</Text>
                        <Text style={styles.listItemMeta}>{peak.meta}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <Card variant="default" padding="lg" style={styles.sideCard}>
              <Text style={styles.sectionTitle}>Top Misconception Clusters</Text>
              <Text style={styles.sectionSubtitle}>
                The most repeated confusion groups captured during class.
              </Text>

              {summary.topClusters.length === 0 ? (
                <Text style={styles.emptyText}>No misconception clusters were saved for this session.</Text>
              ) : (
                <View style={styles.clusterList}>
                  {summary.topClusters.map((cluster) => (
                    <View key={cluster.id} style={styles.clusterCard}>
                      <View style={styles.clusterHeader}>
                        <Text style={styles.clusterTitle}>{cluster.title}</Text>
                        <Badge
                          label={`${cluster.affectedCount} students`}
                          variant="info"
                          size="sm"
                        />
                      </View>
                      <Text style={styles.clusterSummary}>{cluster.summary}</Text>
                      <Text style={styles.clusterMeta}>
                        Representative question: {cluster.representativeQuestion}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <Card variant="default" padding="lg" style={styles.sideCard}>
              <Text style={styles.sectionTitle}>Most Common Reasons</Text>
              <Text style={styles.sectionSubtitle}>
                Reason-chip totals weighted by how many students were pulled into each cluster.
              </Text>

              {summary.topReasonChips.length === 0 ? (
                <Text style={styles.emptyText}>Reason-chip insights will appear once clusters are available.</Text>
              ) : (
                <View style={styles.reasonChipWrap}>
                  {summary.topReasonChips.map((chip) => (
                    <View key={chip.chip} style={styles.reasonChip}>
                      <Text style={styles.reasonChipText}>{formatReasonChip(chip.chip)}</Text>
                      <Text style={styles.reasonChipCount}>{chip.count}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <Card variant="default" padding="lg" style={styles.sideCard}>
              <Text style={styles.sectionTitle}>Interventions & Effectiveness</Text>
              <Text style={styles.sectionSubtitle}>
                Aggregated classroom actions and their measured recovery effect.
              </Text>

              {summary.interventionStats.length === 0 ? (
                <Text style={styles.emptyText}>No interventions were logged during this session.</Text>
              ) : (
                <View style={styles.list}>
                  {summary.interventionStats.map((stat) => (
                    <View key={stat.type} style={styles.interventionRow}>
                      <View style={styles.interventionHeader}>
                        <Text style={styles.interventionTitle}>
                          {formatInterventionType(stat.type)}
                        </Text>
                        <Badge label={`${stat.count} used`} variant="primary" size="sm" />
                      </View>
                      <InsightRow
                        label="Average effect"
                        value={
                          stat.avgRecoveryScore != null
                            ? `${stat.avgRecoveryScore > 0 ? "-" : "+"}${Math.abs(
                                stat.avgRecoveryScore
                              ).toFixed(1)} confusion`
                            : "Measuring"
                        }
                      />
                      <InsightRow
                        label="Successful drops"
                        value={`${stat.successfulCount}`}
                      />
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing["3xl"],
    gap: spacing.xl,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  headerCopy: {
    flex: 1,
    minWidth: 280,
  },
  headerBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.base,
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
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },

  // Hero recovery card (dark)
  heroCard: {
    backgroundColor: colors.dark.surface,
    borderRadius: borderRadius["3xl"],
    ...shadows.lg,
  },
  heroTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xl,
    justifyContent: "space-between",
  },
  heroCopy: {
    flex: 1,
    minWidth: 260,
  },
  heroEyebrow: {
    ...textStyles.label,
    color: colors.primary[200],
    letterSpacing: 0.4,
  },
  heroScore: {
    ...textStyles.displayLarge,
    color: colors.text.inverse,
    marginTop: spacing.sm,
  },
  heroDescription: {
    ...textStyles.bodyLarge,
    color: colors.dark.text,
    marginTop: spacing.sm,
    maxWidth: 560,
    lineHeight: 24,
  },
  heroMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
    flex: 1,
    justifyContent: "flex-end",
    minWidth: 280,
  },
  metricCard: {
    minWidth: 140,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.dark.surfaceLight,
  },
  metricLabel: {
    ...textStyles.caption,
    color: colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    ...textStyles.headingLarge,
    color: colors.text.inverse,
    marginTop: spacing.sm,
  },
  metricHint: {
    ...textStyles.bodySmall,
    color: colors.dark.textSecondary,
    marginTop: spacing.xs,
  },

  // Two-column layout
  columns: {
    flexDirection: "row",
    gap: spacing.xl,
    alignItems: "flex-start",
  },
  columnsStacked: {
    flexDirection: "column",
  },
  mainColumn: {
    flex: 1.45,
    gap: spacing.xl,
  },
  sideColumn: {
    flex: 1,
    gap: spacing.xl,
    minWidth: 320,
  },

  // Section cards
  sectionCard: {
    gap: spacing.base,
    borderRadius: borderRadius["2xl"],
  },
  sideCard: {
    gap: spacing.base,
    borderRadius: borderRadius["2xl"],
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    flexWrap: "wrap",
  },
  sectionTitle: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
  },
  sectionSubtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },

  // AI Narrative
  narrativeText: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    marginTop: spacing.base,
    lineHeight: 26,
  },
  nextActivityCard: {
    marginTop: spacing.lg,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary[50],
  },
  nextActivityLabel: {
    ...textStyles.label,
    color: colors.primary[700],
    letterSpacing: 0.3,
  },
  nextActivityText: {
    ...textStyles.bodyLarge,
    color: colors.primary[800],
    marginTop: spacing.sm,
    lineHeight: 24,
  },
  pollInsightCard: {
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
  },
  pollInsightLabel: {
    ...textStyles.label,
    color: colors.text.secondary,
  },
  pollInsightText: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  pollInsightMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },

  // Voice reflection
  voiceDisabledCard: {
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
    gap: spacing.sm,
  },
  voiceDisabledTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  voiceDisabledText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  voiceActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  transcribingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  transcribingText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  voiceError: {
    ...textStyles.bodySmall,
    color: colors.status.error,
    marginTop: spacing.base,
  },
  reflectionInput: {
    marginTop: spacing.base,
    minHeight: 160,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
    padding: spacing.base,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  reflectionPlanCard: {
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
    gap: spacing.base,
  },
  reflectionPlanHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  reflectionPlanTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  reflectionPlanSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  reflectionPlanSummary: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    lineHeight: 22,
  },
  reflectionActionList: {
    gap: spacing.base,
  },
  reflectionActionItem: {
    flexDirection: "row",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  reflectionActionCopy: {
    flex: 1,
  },
  reflectionActionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  reflectionActionDetail: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
    lineHeight: 18,
  },
  reflectionActionMeta: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    marginTop: spacing.xxs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  voiceFooter: {
    marginTop: spacing.base,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.base,
    flexWrap: "wrap",
  },
  voiceHint: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    flex: 1,
    minWidth: 240,
  },

  // Peak confusion list
  list: {
    gap: spacing.base,
    marginTop: spacing.base,
  },
  listItem: {
    flexDirection: "row",
    gap: spacing.base,
    alignItems: "flex-start",
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
  },
  indexBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary[100],
  },
  indexBubbleText: {
    ...textStyles.bodySmall,
    color: colors.primary[700],
    fontWeight: "700",
  },
  listItemCopy: {
    flex: 1,
  },
  listItemTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  listItemMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },

  // Cluster cards
  clusterList: {
    gap: spacing.base,
    marginTop: spacing.base,
  },
  clusterCard: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
    gap: spacing.sm,
  },
  clusterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  clusterTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    flex: 1,
  },
  clusterSummary: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  clusterMeta: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    fontStyle: "italic",
  },

  // Reason chips
  reasonChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  reasonChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
  },
  reasonChipText: {
    ...textStyles.bodySmall,
    color: colors.primary[700],
    fontWeight: "600",
  },
  reasonChipCount: {
    ...textStyles.caption,
    color: colors.primary[500],
    fontWeight: "700",
  },

  // Intervention stats
  interventionRow: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
    gap: spacing.sm,
  },
  interventionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "center",
  },
  interventionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    flex: 1,
  },
  insightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  insightLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  insightValue: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: "600",
  },
  emptyText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    marginTop: spacing.base,
    fontStyle: "italic",
  },

  // Error state
  errorState: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.base,
  },
  errorTitle: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
    textAlign: "center",
  },
  errorText: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    textAlign: "center",
    maxWidth: 520,
  },
});
