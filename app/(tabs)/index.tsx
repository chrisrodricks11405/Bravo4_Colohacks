import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, Card, StatusChip } from "../../src/components/ui";
import { useRecentSessions } from "../../src/hooks/useRecentSessions";
import { Sentry } from "../../src/lib/monitoring";
import { hasSupabaseConfig } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers";
import { voiceProvider } from "../../src/services";
import { useNetworkStore, usePreferencesStore } from "../../src/stores";
import { useShallow } from "zustand/react/shallow";
import type { RecentSession } from "../../src/types";
import { borderRadius, colors, shadows, spacing, textStyles } from "../../src/theme";

function formatSessionDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSyncTime(value: string | null) {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function QuickAccessCard({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.quickAccessCard}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Text style={styles.quickAccessTitle}>{title}</Text>
      <Text style={styles.quickAccessArrow}>→</Text>
    </TouchableOpacity>
  );
}

function ConfusionBar({ value }: { value: number | null }) {
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0;
  const barColor =
    pct < 30 ? colors.pulse.gotIt : pct < 60 ? colors.pulse.sortOf : colors.pulse.lost;

  return (
    <View style={styles.confusionBarTrack}>
      <View style={[styles.confusionBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
    </View>
  );
}

function RecentSessionRow({ session, onPress }: { session: RecentSession; onPress: () => void }) {
  const statusVariant =
    session.status === "ended"
      ? "success"
      : session.status === "active"
        ? "info"
        : "neutral";

  return (
    <TouchableOpacity style={styles.sessionRow} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.sessionRowLeft}>
        <View style={styles.sessionSubjectDot}>
          <Text style={styles.sessionSubjectInitial}>
            {session.subject.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionTitle} numberOfLines={1}>
            {session.topic || session.subject}
          </Text>
          <Text style={styles.sessionMeta}>
            {session.gradeClass} · {session.subject} · {session.participantCount} students
          </Text>
        </View>
      </View>
      <View style={styles.sessionRowRight}>
        <View style={styles.sessionConfusionBlock}>
          <Text style={styles.sessionConfusionLabel}>CONFUSION INDEX</Text>
          <ConfusionBar value={session.confusionIndexAvg ?? null} />
        </View>
        <View style={styles.sessionBadges}>
          <Badge label={session.status === "active" ? "Active Now" : "Ended"} variant={statusVariant} size="sm" />
          <Badge
            label={session.synced ? "Synced" : "Local"}
            variant={session.synced ? "success" : "warning"}
            size="sm"
            dot
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const voiceCapabilities = voiceProvider.getCapabilities();
  const preferences = usePreferencesStore(useShallow((state) => ({
    defaultLanguage: state.defaultLanguage,
    defaultLostThreshold: state.defaultLostThreshold,
    defaultSubject: state.defaultSubject,
    defaultGradeClass: state.defaultGradeClass,
    aiProviderEnabled: state.aiProviderEnabled,
    voiceEnabled: state.voiceEnabled,
  })));
  const {
    isConnected,
    supabaseReachable,
    voiceServiceReachable,
    pendingSyncCount,
    failedSyncCount,
    lastSyncAt,
    mode,
    syncInProgress,
    syncProgress,
  } = useNetworkStore();
  const { sessions, isLoading, isRefreshing, isSyncing, lastSyncedAt, syncError, refresh } =
    useRecentSessions({ limit: 8, autoSync: true });

  const syncStatus =
    syncInProgress || isSyncing
      ? { status: "syncing" as const, label: "Syncing" }
      : failedSyncCount > 0 || syncError
        ? { status: "error" as const, label: "Sync issue" }
        : pendingSyncCount > 0
          ? { status: "offline" as const, label: `${pendingSyncCount} pending` }
          : { status: "online" as const, label: "Up to date" };

  const aiBadge =
    preferences.aiProviderEnabled && isConnected
      ? { label: "AI Ready", variant: "success" as const }
      : preferences.aiProviderEnabled
        ? { label: "AI Offline", variant: "warning" as const }
        : { label: "AI Off", variant: "neutral" as const };

  const voiceBadge = preferences.voiceEnabled
    ? voiceCapabilities.available && voiceServiceReachable
      ? { label: "Voice On", variant: "success" as const }
      : voiceCapabilities.available
        ? { label: "Voice Offline", variant: "warning" as const }
        : { label: "Voice N/A", variant: "neutral" as const }
    : { label: "Voice Off", variant: "neutral" as const };

  const latestSession = sessions[0] ?? null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Sentry.TimeToInitialDisplay record />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { void refresh("pull"); }}
            tintColor={colors.primary[600]}
          />
        }
      >
        {/* Top Header Bar */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ClassPulse AI</Text>
          <View style={styles.headerRight}>
            <StatusChip status={isConnected ? "online" : "offline"} />
            <StatusChip status={syncStatus.status} label={syncStatus.label} />
            <Badge label={aiBadge.label} variant={aiBadge.variant} size="sm" dot />
            <Badge label={voiceBadge.label} variant={voiceBadge.variant} size="sm" dot />
            {user?.email ? (
              <Text style={styles.headerEmail}>{user.email}</Text>
            ) : null}
          </View>
        </View>

        {/* Three-column layout */}
        <View style={styles.columns}>
          {/* Left Column - Session Launcher + Recent Sessions */}
          <View style={styles.leftColumn}>
            {/* Hero Session Launcher */}
            <Card variant="dark" padding="lg" style={styles.heroCard}>
              <Text style={styles.heroTitle}>Ready to teach?</Text>
              <View style={styles.heroChips}>
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>{preferences.defaultSubject ?? "Subject"}</Text>
                </View>
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>{preferences.defaultGradeClass ?? "Class"}</Text>
                </View>
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>{preferences.defaultLanguage}</Text>
                </View>
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>{preferences.defaultLostThreshold}% threshold</Text>
                </View>
              </View>
              <View style={styles.heroButtons}>
                <Button
                  title="Start Session"
                  onPress={() => router.push("/session/create?mode=online")}
                  size="lg"
                  style={styles.heroStartButton}
                  textStyle={styles.heroStartText}
                  icon={<Text style={{ color: colors.primary[700], fontSize: 16 }}>▶</Text>}
                />
                <Button
                  title="Offline Mode"
                  onPress={() => router.push("/session/create?mode=offline")}
                  size="lg"
                  variant="outline"
                  style={styles.heroOfflineButton}
                  textStyle={styles.heroOfflineText}
                />
              </View>
            </Card>

            {/* Live Feed / Recent Insights */}
            {latestSession ? (
              <Card variant="default" padding="lg" style={styles.liveFeedCard}>
                <Text style={styles.sectionLabel}>Live Feed / Recent Insights</Text>
                <View style={styles.liveFeedContent}>
                  <View style={styles.liveFeedHeader}>
                    <Text style={styles.liveFeedTitle}>{latestSession.topic || latestSession.subject}</Text>
                    <Badge
                      label={latestSession.status === "active" ? "Active" : "Ended"}
                      variant={latestSession.status === "active" ? "success" : "neutral"}
                      size="sm"
                      dot
                    />
                  </View>
                  <Text style={styles.liveFeedMeta}>
                    {latestSession.gradeClass} · {latestSession.participantCount} students
                  </Text>
                  <View style={styles.liveFeedMetrics}>
                    <View style={styles.liveFeedMetric}>
                      <Text style={styles.liveFeedMetricLabel}>CONFUSION INDEX</Text>
                      <ConfusionBar value={latestSession.confusionIndexAvg ?? null} />
                    </View>
                  </View>
                  <Button
                    title="View Summary"
                    variant="primary"
                    size="sm"
                    onPress={() =>
                      router.push({ pathname: "/session/summary", params: { sessionId: latestSession.id } })
                    }
                    style={styles.liveFeedButton}
                  />
                  <Badge
                    label={latestSession.synced ? "Synced" : "Syncing..."}
                    variant={latestSession.synced ? "success" : "info"}
                    size="sm"
                    dot
                    style={styles.liveFeedSyncBadge}
                  />
                </View>
              </Card>
            ) : null}

            {/* Recent Sessions */}
            <View style={styles.recentHeader}>
              <Text style={styles.sectionTitle}>
                Recent Sessions ({sessions.length})
              </Text>
            </View>

            {isLoading ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator size="large" color={colors.primary[600]} />
                <Text style={styles.loadingText}>Loading sessions…</Text>
              </View>
            ) : sessions.length === 0 ? (
              <Card variant="tonal" padding="lg">
                <Text style={styles.emptyTitle}>No sessions yet</Text>
                <Text style={styles.emptyText}>
                  Start your first class to see it here.
                </Text>
              </Card>
            ) : (
              <View style={styles.sessionsList}>
                {sessions.map((session) => (
                  <RecentSessionRow
                    key={session.id}
                    session={session}
                    onPress={() =>
                      session.status === "active"
                        ? router.push({ pathname: "/session/live", params: { sessionId: session.id } })
                        : router.push({ pathname: "/session/summary", params: { sessionId: session.id } })
                    }
                  />
                ))}
              </View>
            )}
          </View>

          {/* Right Column - Quick Access + System Health */}
          <View style={styles.rightColumn}>
            {/* Quick Access */}
            <Text style={styles.sectionTitle}>Quick Access</Text>
            <View style={styles.quickAccessGrid}>
              <QuickAccessCard title="Past Summaries" onPress={() => router.push("/(tabs)/summaries")} />
              <QuickAccessCard title="Settings" onPress={() => router.push("/(tabs)/settings")} />
            </View>

            {/* Weekly Patterns Preview */}
            <Card variant="default" padding="lg" style={styles.weeklyCard}>
              <Text style={styles.cardTitle}>Weekly Patterns</Text>
              <View style={styles.weeklyBars}>
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                  <View key={day} style={styles.weeklyBarCol}>
                    <View style={styles.weeklyBarTrack}>
                      <View
                        style={[
                          styles.weeklyBarFill,
                          { height: `${Math.random() * 60 + 20}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.weeklyBarLabel}>{day}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* System Health */}
            <Card variant="default" padding="lg" style={styles.healthCard}>
              <View style={styles.healthHeader}>
                <Text style={styles.cardTitle}>System Health</Text>
                <Badge
                  label={failedSyncCount > 0 ? "Needs Attention" : "Healthy"}
                  variant={failedSyncCount > 0 ? "warning" : "success"}
                  size="sm"
                />
              </View>

              <View style={styles.healthRows}>
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Network</Text>
                  <Text style={styles.healthValue}>
                    {mode === "local_hotspot" ? "Edge Adaptive" : mode === "offline" ? "Offline" : "Online"}
                  </Text>
                </View>
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Supabase</Text>
                  <View style={styles.healthValueRow}>
                    <View
                      style={[
                        styles.healthDot,
                        {
                          backgroundColor:
                            supabaseReachable && hasSupabaseConfig
                              ? colors.status.success
                              : colors.status.error,
                        },
                      ]}
                    />
                    <Text style={styles.healthValue}>
                      {supabaseReachable && hasSupabaseConfig ? "Connected" : "Unreachable"}
                    </Text>
                  </View>
                </View>
                <View style={styles.healthRow}>
                  <Text style={styles.healthLabel}>Pending Jobs</Text>
                  <Text style={styles.healthValue}>{pendingSyncCount} Tasks</Text>
                </View>
              </View>

              <View style={styles.healthFooter}>
                <Text style={styles.healthFooterLabel}>LAST SYNC</Text>
                <Text style={styles.healthFooterValue}>
                  {lastSyncAt || lastSyncedAt
                    ? `Just now · ${formatSyncTime(lastSyncAt ?? lastSyncedAt)}`
                    : "Not synced yet"}
                </Text>
              </View>
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
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing["3xl"],
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.base,
    marginBottom: spacing.lg,
  },
  headerTitle: {
    ...textStyles.headingMedium,
    color: colors.primary[600],
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerEmail: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginLeft: spacing.sm,
  },

  // Columns
  columns: {
    flexDirection: "row",
    gap: spacing.xl,
    alignItems: "flex-start",
  },
  leftColumn: {
    flex: 1.5,
    gap: spacing.lg,
  },
  rightColumn: {
    flex: 0.9,
    gap: spacing.lg,
  },

  // Hero Card
  heroCard: {
    borderRadius: borderRadius["2xl"],
  },
  heroTitle: {
    ...textStyles.headingLarge,
    color: colors.text.inverse,
    marginBottom: spacing.base,
  },
  heroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  heroChip: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  heroChipText: {
    ...textStyles.caption,
    color: "rgba(255, 255, 255, 0.65)",
  },
  heroButtons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  heroStartButton: {
    flex: 1,
    backgroundColor: colors.text.inverse,
  },
  heroStartText: {
    color: colors.primary[700],
  },
  heroOfflineButton: {
    flex: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  heroOfflineText: {
    color: colors.text.inverse,
  },

  // Live Feed
  liveFeedCard: {
    borderRadius: borderRadius["2xl"],
  },
  sectionLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
    marginBottom: spacing.base,
  },
  liveFeedContent: {
    gap: spacing.sm,
  },
  liveFeedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  liveFeedTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  liveFeedMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  liveFeedMetrics: {
    marginTop: spacing.sm,
  },
  liveFeedMetric: {
    gap: spacing.xs,
  },
  liveFeedMetricLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  liveFeedButton: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
  },
  liveFeedSyncBadge: {
    alignSelf: "flex-start",
  },

  // Recent Sessions
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  sessionsList: {
    gap: spacing.sm,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface.card,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    gap: spacing.base,
    ...shadows.sm,
  },
  sessionRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  sessionSubjectDot: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  sessionSubjectInitial: {
    ...textStyles.headingSmall,
    color: colors.primary[600],
  },
  sessionInfo: {
    flex: 1,
  },
  sessionTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "600",
  },
  sessionMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  sessionRowRight: {
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  sessionConfusionBlock: {
    alignItems: "flex-end",
    gap: spacing.xs,
    minWidth: 140,
  },
  sessionConfusionLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  sessionBadges: {
    flexDirection: "row",
    gap: spacing.xs,
  },

  // Confusion bar
  confusionBarTrack: {
    width: 120,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface.backgroundAlt,
    overflow: "hidden",
  },
  confusionBarFill: {
    height: "100%",
    borderRadius: 3,
  },

  // Quick Access
  quickAccessGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  quickAccessCard: {
    flex: 1,
    backgroundColor: colors.surface.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    ...shadows.sm,
  },
  quickAccessTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "600",
  },
  quickAccessArrow: {
    ...textStyles.bodyLarge,
    color: colors.primary[600],
  },

  // Weekly patterns
  weeklyCard: {
    borderRadius: borderRadius["2xl"],
  },
  cardTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    marginBottom: spacing.base,
  },
  weeklyBars: {
    flexDirection: "row",
    justifyContent: "space-between",
    height: 100,
    gap: spacing.sm,
  },
  weeklyBarCol: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  weeklyBarTrack: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.surface.backgroundAlt,
    borderRadius: borderRadius.sm,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  weeklyBarFill: {
    width: "100%",
    backgroundColor: colors.pulse.gotIt,
    borderRadius: borderRadius.sm,
    opacity: 0.7,
  },
  weeklyBarLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
  },

  // Health card
  healthCard: {
    borderRadius: borderRadius["2xl"],
  },
  healthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  healthRows: {
    gap: spacing.md,
  },
  healthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  healthLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  healthValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "600",
  },
  healthValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthFooter: {
    marginTop: spacing.lg,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.surface.backgroundAlt,
  },
  healthFooterLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  healthFooterValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "600",
    marginTop: spacing.xs,
  },

  // States
  loadingBlock: {
    paddingVertical: spacing["3xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
  emptyTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
});
