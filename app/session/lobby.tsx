import React, { useEffect } from "react";
import {
  Alert,
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
import { hasSupabaseConfig } from "../../src/lib/supabase";
import { useSessionHydration } from "../../src/providers";
import { useNetworkStore, useSessionStore } from "../../src/stores";
import { borderRadius, colors, spacing, textStyles } from "../../src/theme";

function getQualityMeta(quality: "good" | "fair" | "poor" | "none") {
  switch (quality) {
    case "good":
      return { label: "Strong", activeBars: 4 };
    case "fair":
      return { label: "Fair", activeBars: 3 };
    case "poor":
      return { label: "Weak", activeBars: 2 };
    default:
      return { label: "Offline", activeBars: 0 };
  }
}

function formatJoinCode(joinCode: string) {
  return joinCode.split("").join(" ");
}

function MetricCard({
  label,
  value,
  supporting,
}: {
  label: string;
  value: string;
  supporting?: string;
}) {
  return (
    <Card variant="default" padding="lg" style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {supporting ? <Text style={styles.metricSupporting}>{supporting}</Text> : null}
    </Card>
  );
}

function NetworkIndicator({
  isConnected,
  connectionQuality,
  remoteState,
}: {
  isConnected: boolean;
  connectionQuality: "good" | "fair" | "poor" | "none";
  remoteState: "live" | "connecting" | "degraded" | "disabled";
}) {
  const quality = getQualityMeta(connectionQuality);

  return (
    <View style={styles.networkBlock}>
      <View style={styles.networkHeader}>
        <View>
          <Text style={styles.panelTitle}>Network quality</Text>
          <Text style={styles.panelText}>
            {isConnected
              ? "Lobby transport is ready for student joins."
              : "Lobby is still usable locally while connectivity is down."}
          </Text>
        </View>
        <Badge
          label={
            remoteState === "live"
              ? "Realtime live"
              : remoteState === "connecting"
                ? "Connecting"
                : remoteState === "disabled"
                  ? "Realtime off"
                  : "Realtime degraded"
          }
          variant={
            remoteState === "live"
              ? "success"
              : remoteState === "connecting"
                ? "info"
                : remoteState === "disabled"
                  ? "neutral"
                  : "warning"
          }
          size="md"
        />
      </View>

      <View style={styles.networkMeterRow}>
        <View style={styles.networkBars}>
          {[0, 1, 2, 3].map((bar) => (
            <View
              key={bar}
              style={[
                styles.networkBar,
                { height: 12 + bar * 6 },
                bar < quality.activeBars && styles.networkBarActive,
                !isConnected && styles.networkBarInactive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.networkMeterValue}>{quality.label}</Text>
      </View>
    </View>
  );
}

export default function SessionLobbyScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const { isHydrating } = useSessionHydration();
  const storeSessionMode = useSessionStore((state) => state.session?.mode);
  const setNetworkMode = useNetworkStore((state) => state.setMode);
  const isConnected = useNetworkStore((state) => state.isConnected);
  const connectionQuality = useNetworkStore((state) => state.connectionQuality);
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);

  const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const realtimeEnabled =
    Boolean(hasSupabaseConfig) &&
    supabaseReachable &&
    storeSessionMode !== "offline";

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
    if (!session) {
      return;
    }

    setNetworkMode(session.mode === "offline" ? "local_hotspot" : "online");
  }, [session, setNetworkMode]);

  useEffect(() => {
    if (session?.status === "active") {
      router.replace({
        pathname: "/session/live",
        params: { sessionId: session.id },
      });
    }
  }, [router, session?.id, session?.status]);

  const isBusy = isHydrating || isLoading;

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

  const qrSize = Math.min(width * 0.38, height * 0.62, 380);
  const isCompact = width < 1100;
  const canSyncImmediately =
    session.mode === "online" && supabaseReachable && hasSupabaseConfig;
  const displayedRemoteState = session.mode === "offline" ? "disabled" : remoteState;

  const handleLockPress = async () => {
    try {
      await lockSession(canSyncImmediately);
    } catch {
      // Error state is surfaced in the screen body.
    }
  };

  const handleRegeneratePress = async () => {
    if (session.participantCount > 0 && !session.lockedAt) {
      Alert.alert(
        "Regenerate join code?",
        "Students already in the lobby will need the new code or QR after regeneration.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Regenerate",
            style: "destructive",
            onPress: () => {
              void regenerateCode(canSyncImmediately);
            },
          },
        ]
      );
      return;
    }

    try {
      await regenerateCode(canSyncImmediately);
    } catch {
      // Error state is surfaced in the screen body.
    }
  };

  const handleBeginClass = async () => {
    try {
      const nextSession = await beginClass(canSyncImmediately);
      router.replace({
        pathname: "/session/live",
        params: { sessionId: nextSession.id },
      });
    } catch {
      // Error state is surfaced in the screen body.
    }
  };

  const statusBadge =
    session.mode === "offline"
      ? { label: "Offline hotspot", variant: "warning" as const }
      : supabaseReachable && displayedRemoteState === "live"
        ? { label: "Online realtime", variant: "success" as const }
        : { label: "Online queued", variant: "info" as const };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={[styles.content, isCompact && styles.contentCompact]}>
        <View style={[styles.qrColumn, isCompact && styles.qrColumnCompact]}>
          <View style={styles.lobbyHeader}>
            <Badge label="Session Lobby" variant="neutral" size="md" style={styles.kicker} />
            <Text style={styles.title}>Students can join now</Text>
            <Text style={styles.subtitle}>
              Keep the QR visible, watch live joins come in, then begin class when the room is ready.
            </Text>
          </View>

          <View style={styles.qrShell}>
            <View style={styles.qrCard}>
              <QRCode
                value={session.qrPayload}
                size={qrSize}
                color={colors.text.primary}
                backgroundColor={colors.surface.card}
              />
            </View>
          </View>

          <View style={styles.codeRow}>
            <View>
              <Text style={styles.codeLabel}>4-digit join code</Text>
              <Text style={styles.codeValue}>{formatJoinCode(session.joinCode)}</Text>
            </View>
            <Badge label={statusBadge.label} variant={statusBadge.variant} size="md" />
          </View>

          <Text style={styles.joinUrl} numberOfLines={1}>
            {session.qrPayload}
          </Text>
        </View>

        <View style={styles.sideColumn}>
          <View style={styles.topBadges}>
            <StatusChip status={isConnected ? "online" : "offline"} />
            <Badge
              label={session.lockedAt ? "Session locked" : "Open for joins"}
              variant={session.lockedAt ? "error" : "success"}
              size="md"
            />
            <Badge
              label={session.mode === "offline" ? "Hotspot" : "Supabase"}
              variant={session.mode === "offline" ? "warning" : "primary"}
              size="md"
            />
          </View>

          <View style={styles.metricsGrid}>
            <MetricCard
              label="Join count"
              value={`${session.participantCount}`}
              supporting={displayedRemoteState === "live" ? "Updating live from Supabase" : "Waiting for joins"}
            />
            <MetricCard
              label="Lost threshold"
              value={`${session.lostThreshold}%`}
              supporting="Teacher intervention trigger"
            />
          </View>

          <Card variant="default" padding="lg" style={styles.panel}>
            <Text style={styles.panelTitle}>Class setup</Text>
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
            </View>

            {session.lessonPlanSeed ? (
              <View style={styles.seedBlock}>
                <Text style={styles.detailLabel}>Lesson seed</Text>
                <Text style={styles.seedText}>{session.lessonPlanSeed}</Text>
              </View>
            ) : null}
          </Card>

          <Card variant="default" padding="lg" style={styles.panel}>
            <NetworkIndicator
              isConnected={isConnected}
              connectionQuality={connectionQuality}
              remoteState={displayedRemoteState}
            />
            {!canSyncImmediately ? (
              <Text style={styles.offlineNotice}>
                {session.mode === "offline"
                  ? "Offline hotspot mode keeps the lobby local-first. Realtime join counts reactivate when you create an online session."
                  : !hasSupabaseConfig
                    ? "Supabase credentials are not configured, so this lobby is running from local session storage only."
                    : "Network connectivity is limited right now, so session updates are queued locally until the connection recovers."}
              </Text>
            ) : null}
          </Card>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Button
              title={session.lockedAt ? "Unlock Session" : "Lock Session"}
              onPress={handleLockPress}
              loading={isLocking}
              variant={session.lockedAt ? "secondary" : "outline"}
              size="lg"
              style={styles.actionButton}
            />
            <Button
              title="Regenerate Code"
              onPress={handleRegeneratePress}
              loading={isRegeneratingCode}
              variant="outline"
              size="lg"
              style={styles.actionButton}
            />
          </View>

          <Button
            title="Begin Class"
            onPress={handleBeginClass}
            loading={isStartingClass}
            size="lg"
            fullWidth
            style={styles.beginButton}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.replace("/(tabs)")}
            style={styles.secondaryLink}
          >
            <Text style={styles.secondaryLinkText}>Return to teacher home</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.background,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xl,
    padding: spacing.xl,
  },
  contentCompact: {
    flexDirection: "column",
  },
  qrColumn: {
    flex: 1.15,
    gap: spacing.base,
  },
  qrColumnCompact: {
    flex: 0,
  },
  sideColumn: {
    flex: 0.95,
    gap: spacing.base,
  },
  lobbyHeader: {
    gap: spacing.sm,
  },
  kicker: {
    alignSelf: "flex-start",
  },
  title: {
    ...textStyles.displayMedium,
    color: colors.text.inverse,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.dark.textSecondary,
    maxWidth: 720,
  },
  qrShell: {
    flex: 1,
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
  },
  qrCard: {
    padding: spacing.xl,
    borderRadius: 32,
    backgroundColor: colors.surface.card,
    borderWidth: 6,
    borderColor: "#E2E8F0",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  codeLabel: {
    ...textStyles.label,
    color: colors.dark.textSecondary,
    marginBottom: spacing.xxs,
  },
  codeValue: {
    ...textStyles.metric,
    color: colors.text.inverse,
    letterSpacing: 6,
  },
  joinUrl: {
    ...textStyles.bodySmall,
    color: colors.dark.textSecondary,
  },
  topBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: spacing.base,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.dark.surface,
    borderColor: colors.dark.surfaceLight,
  },
  metricLabel: {
    ...textStyles.label,
    color: colors.dark.textSecondary,
    marginBottom: spacing.xs,
  },
  metricValue: {
    ...textStyles.metric,
    color: colors.text.inverse,
  },
  metricSupporting: {
    ...textStyles.bodySmall,
    color: colors.dark.textSecondary,
    marginTop: spacing.xs,
  },
  panel: {
    backgroundColor: colors.dark.surface,
    borderColor: colors.dark.surfaceLight,
  },
  panelTitle: {
    ...textStyles.headingSmall,
    color: colors.text.inverse,
    marginBottom: spacing.base,
  },
  panelText: {
    ...textStyles.bodySmall,
    color: colors.dark.textSecondary,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  detailItem: {
    width: "47%",
    gap: spacing.xxs,
  },
  detailLabel: {
    ...textStyles.label,
    color: colors.dark.textSecondary,
  },
  detailValue: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
  },
  seedBlock: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  seedText: {
    ...textStyles.bodyMedium,
    color: colors.dark.text,
    lineHeight: 24,
  },
  networkBlock: {
    gap: spacing.base,
  },
  networkHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  networkMeterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  networkBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  networkBar: {
    width: 16,
    borderRadius: borderRadius.sm,
    backgroundColor: "#3B3F67",
  },
  networkBarActive: {
    backgroundColor: colors.status.success,
  },
  networkBarInactive: {
    backgroundColor: "#475569",
  },
  networkMeterValue: {
    ...textStyles.headingSmall,
    color: colors.text.inverse,
  },
  offlineNotice: {
    ...textStyles.bodySmall,
    color: colors.dark.textSecondary,
    marginTop: spacing.base,
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: "#FCA5A5",
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.base,
  },
  actionButton: {
    flex: 1,
  },
  beginButton: {
    backgroundColor: colors.primary[500],
    borderColor: colors.primary[500],
  },
  secondaryLink: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  secondaryLinkText: {
    ...textStyles.bodyMedium,
    color: colors.dark.textSecondary,
  },
});
