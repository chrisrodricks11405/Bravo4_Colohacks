import React, { useEffect } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { StateScreen } from "../../src/components/app/StateScreen";
import { Badge, Button, Card, StatusChip } from "../../src/components/ui";
import { useSessionLobby } from "../../src/hooks/useSessionLobby";
import { Sentry } from "../../src/lib/monitoring";
import { hasSupabaseConfig } from "../../src/lib/supabase";
import { useSessionHydration } from "../../src/providers";
import { useNetworkStore, useSessionStore } from "../../src/stores";
import { borderRadius, colors, shadows, spacing, textStyles } from "../../src/theme";

function getQualityMeta(quality: "good" | "fair" | "poor" | "none") {
  switch (quality) {
    case "good":
      return { label: "Strong", activeBars: 4, color: colors.status.success };
    case "fair":
      return { label: "Fair", activeBars: 3, color: colors.status.warning };
    case "poor":
      return { label: "Weak", activeBars: 2, color: colors.status.error };
    default:
      return { label: "Offline", activeBars: 0, color: colors.text.tertiary };
  }
}

function formatJoinCode(joinCode: string) {
  return joinCode.split("").join("  ");
}

export default function SessionLobbyScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const { isHydrating } = useSessionHydration();
  const storeSessionMode = useSessionStore((state) => state.session?.mode);
  const setStoredSession = useSessionStore((state) => state.setSession);
  const setNetworkMode = useNetworkStore((state) => state.setMode);
  const isConnected = useNetworkStore((state) => state.isConnected);
  const connectionQuality = useNetworkStore((state) => state.connectionQuality);
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);

  const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const realtimeEnabled =
    Boolean(hasSupabaseConfig) && supabaseReachable && storeSessionMode !== "offline";

  const {
    session,
    isLoading,
    error,
    remoteState,
    isLocking,
    isRegeneratingCode,
    isStartingClass,
    lockSession,
    regenerateCode,
    beginClass,
  } = useSessionLobby(normalizedSessionId, realtimeEnabled);

  useEffect(() => {
    if (!session) return;
    setNetworkMode(session.mode === "offline" ? "local_hotspot" : "online");
  }, [session, setNetworkMode]);

  useEffect(() => {
    if (session?.status === "active") {
      router.replace({ pathname: "/session/live", params: { sessionId: session.id } });
    }
  }, [router, session?.id, session?.status]);

  const isBusy = !session && (isHydrating || isLoading);

  if (isBusy) {
    return (
      <StateScreen
        title="Restoring lobby"
        message="Loading the saved session, QR payload, and join settings."
        tone="dark"
        loading
      />
    );
  }

  if (!session) {
    return (
      <StateScreen
        title="No active session"
        message="Create a session first to open the teacher lobby."
        tone="dark"
      />
    );
  }

  const qrSize = Math.min(width * 0.3, height * 0.5, 300);
  const canSyncImmediately = session.mode === "online" && supabaseReachable && hasSupabaseConfig;
  const displayedRemoteState = session.mode === "offline" ? "disabled" : remoteState;
  const quality = getQualityMeta(connectionQuality);
  const isCompactLayout = width < 1180;

  const handleLockPress = async () => {
    try { await lockSession(canSyncImmediately); } catch {}
  };

  const handleRegeneratePress = async () => {
    if (session.participantCount > 0 && !session.lockedAt) {
      Alert.alert(
        "Regenerate join code?",
        "Students already in the lobby will need the new code.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Regenerate", style: "destructive", onPress: () => { void regenerateCode(canSyncImmediately); } },
        ]
      );
      return;
    }
    try { await regenerateCode(canSyncImmediately); } catch {}
  };

  const handleBeginClass = async () => {
    try {
      const nextSession = await beginClass(canSyncImmediately);
      setStoredSession(nextSession);
      router.replace({ pathname: "/session/live", params: { sessionId: nextSession.id } });
    } catch (beginError) {
      Alert.alert(
        "Could not begin class",
        beginError instanceof Error ? beginError.message : "Try again in a moment."
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Sentry.TimeToInitialDisplay record />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={[styles.topBar, isCompactLayout && styles.topBarCompact]}>
          <View style={[styles.topBarLeft, isCompactLayout && styles.topBarLeftCompact]}>
            <Badge
              label="Session Lobby"
              variant={session.mode === "offline" ? "warning" : "success"}
              size="md"
            />
            <Text style={styles.topBarTitle}>{session.subject} — {session.topic}</Text>
          </View>
          <View style={styles.topBarRight}>
            {/* Network quality indicator */}
            <View style={styles.signalBars}>
              {[0, 1, 2, 3].map((bar) => (
                <View
                  key={bar}
                  style={[
                    styles.signalBar,
                    { height: 10 + bar * 5 },
                    bar < quality.activeBars && { backgroundColor: quality.color },
                  ]}
                />
              ))}
            </View>
            <StatusChip status={isConnected ? "online" : "offline"} />
          </View>
        </View>

        <View style={[styles.content, isCompactLayout && styles.contentCompact]}>
          {/* Left: QR + Code */}
          <View style={[styles.qrColumn, isCompactLayout && styles.qrColumnCompact]}>
            <View style={styles.qrArea}>
              {/* QR card with subtle shadow */}
              <View style={styles.qrCard}>
                <QRCode
                  value={session.qrPayload}
                  size={qrSize}
                  color={colors.text.primary}
                  backgroundColor={colors.surface.card}
                />
              </View>

              {/* Join code */}
              <View style={styles.codeBlock}>
                <Text style={styles.codeValue}>{formatJoinCode(session.joinCode)}</Text>
              </View>
              <Text style={styles.codeHint}>Share this code with students</Text>
            </View>

            {/* Metrics */}
            <View style={[styles.metricsRow, isCompactLayout && styles.metricsRowCompact]}>
              <Card variant="default" padding="lg" style={styles.metricCard}>
                <Text style={styles.metricLabel}>STUDENTS JOINED</Text>
                <Text style={styles.metricValue}>{session.participantCount}</Text>
                <Text style={styles.metricSupporting}>
                  {displayedRemoteState === "live" ? "Updating live" : "Waiting for joins"}
                </Text>
              </Card>
              <Card variant="default" padding="lg" style={styles.metricCard}>
                <Text style={styles.metricLabel}>NETWORK QUALITY</Text>
                <View style={styles.metricSignalRow}>
                  <View style={styles.metricSignalBars}>
                    {[0, 1, 2, 3].map((bar) => (
                      <View
                        key={bar}
                        style={[
                          styles.metricSignalBar,
                          { height: 8 + bar * 4 },
                          bar < quality.activeBars && { backgroundColor: quality.color },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={styles.metricValue}>{quality.label}</Text>
                </View>
              </Card>
            </View>

            {/* Action buttons */}
            <View style={[styles.actionRow, isCompactLayout && styles.actionRowCompact]}>
              <Button
                title="Begin Class"
                onPress={handleBeginClass}
                loading={isStartingClass}
                size="lg"
                style={styles.beginButton}
              />
              <Button
                title={session.lockedAt ? "Unlock" : "Lock Lobby"}
                onPress={handleLockPress}
                loading={isLocking}
                variant="outline"
                size="lg"
                style={styles.actionButton}
              />
              <Button
                title="Regenerate Code"
                onPress={handleRegeneratePress}
                loading={isRegeneratingCode}
                variant="ghost"
                size="lg"
                style={styles.actionButton}
              />
            </View>
          </View>

          {/* Right: Session details */}
          <View style={[styles.detailColumn, isCompactLayout && styles.detailColumnCompact]}>
            <Card variant="tonal" padding="lg" style={styles.detailCard}>
              <Text style={styles.detailTitle}>Class Setup</Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Subject</Text>
                  <Text style={styles.detailValue}>{session.subject}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Topic</Text>
                  <Text style={styles.detailValue}>{session.topic}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Class</Text>
                  <Text style={styles.detailValue}>{session.gradeClass}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Language</Text>
                  <Text style={styles.detailValue}>{session.language}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Alert Sensitivity</Text>
                  <Text style={styles.detailValue}>{session.lostThreshold}%</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Mode</Text>
                  <Text style={styles.detailValue}>
                    {session.mode === "offline" ? "Offline" : "Online"}
                  </Text>
                </View>
              </View>

              {session.lessonPlanSeed ? (
                <View style={styles.seedBlock}>
                  <Text style={styles.detailLabel}>Lesson Notes</Text>
                  <Text style={styles.seedText}>{session.lessonPlanSeed}</Text>
                </View>
              ) : null}
            </Card>

            <Card variant="tonal" padding="lg" style={styles.detailCard}>
              <Text style={styles.detailTitle}>Status</Text>
              <View style={styles.statusRows}>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Connection</Text>
                  <StatusChip status={isConnected ? "online" : "offline"} />
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Live Updates</Text>
                  <Badge
                    label={
                      displayedRemoteState === "live" ? "Active"
                        : displayedRemoteState === "connecting" ? "Connecting"
                        : displayedRemoteState === "disabled" ? "Off"
                        : "Reconnecting"
                    }
                    variant={
                      displayedRemoteState === "live" ? "success"
                        : displayedRemoteState === "connecting" ? "info"
                        : "neutral"
                    }
                    size="sm"
                  />
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Lobby</Text>
                  <Badge
                    label={session.lockedAt ? "Locked" : "Open"}
                    variant={session.lockedAt ? "error" : "success"}
                    size="sm"
                  />
                </View>
              </View>
            </Card>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.replace("/(tabs)")}
              style={styles.backLink}
            >
              <Text style={styles.backLinkText}>← Return to home</Text>
            </TouchableOpacity>
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.base,
  },
  topBarCompact: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  topBarLeftCompact: {
    flexWrap: "wrap",
  },
  topBarTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  signalBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  signalBar: {
    width: 6,
    borderRadius: 2,
    backgroundColor: colors.surface.border,
  },

  // Content
  content: {
    flexDirection: "row",
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  contentCompact: {
    flexDirection: "column",
  },

  // QR Column
  qrColumn: {
    flex: 1.2,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xl,
  },
  qrColumnCompact: {
    width: "100%",
  },
  qrArea: {
    alignItems: "center",
    gap: spacing.lg,
  },
  qrCard: {
    padding: spacing.xl,
    borderRadius: borderRadius["3xl"],
    backgroundColor: colors.surface.card,
    ...shadows.lg,
  },
  codeBlock: {
    backgroundColor: colors.surface.card,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing["2xl"],
    paddingVertical: spacing.base,
    borderWidth: 2,
    borderColor: colors.surface.border,
    borderStyle: "dashed",
  },
  codeValue: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.text.primary,
    letterSpacing: 4,
    fontVariant: ["tabular-nums"],
  },
  codeHint: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },

  // Metrics
  metricsRow: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
    maxWidth: 480,
  },
  metricsRowCompact: {
    flexDirection: "column",
    maxWidth: "100%",
  },
  metricCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
  },
  metricLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  metricValue: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
  },
  metricSupporting: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  metricSignalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  metricSignalBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  metricSignalBar: {
    width: 8,
    borderRadius: 2,
    backgroundColor: colors.surface.border,
  },

  // Actions
  actionRow: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
    maxWidth: 480,
  },
  actionRowCompact: {
    flexDirection: "column",
    maxWidth: "100%",
  },
  beginButton: {
    flex: 2,
  },
  actionButton: {
    flex: 1,
  },

  // Detail Column
  detailColumn: {
    flex: 0.85,
    gap: spacing.base,
  },
  detailColumnCompact: {
    width: "100%",
  },
  detailCard: {
    borderRadius: borderRadius.xl,
  },
  detailTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    marginBottom: spacing.base,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  detailItem: {
    width: "46%",
    gap: spacing.xxs,
  },
  detailLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  detailValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "500",
  },
  seedBlock: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  seedText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    lineHeight: 20,
  },

  // Status
  statusRows: {
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },

  // Error
  errorBox: {
    backgroundColor: colors.status.errorBg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: "#991B1B",
  },

  // Back link
  backLink: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  backLinkText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
});
