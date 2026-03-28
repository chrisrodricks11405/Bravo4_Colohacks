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
import { hasSupabaseConfig } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers";
import { useNetworkStore, usePreferencesStore } from "../../src/stores";
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
  if (!value) {
    return "Not synced yet";
  }

  const date = new Date(value);
  return `Last sync ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

function QuickLink({
  title,
  description,
  onPress,
}: {
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickLink} activeOpacity={0.75} onPress={onPress}>
      <View>
        <Text style={styles.quickLinkTitle}>{title}</Text>
        <Text style={styles.quickLinkDescription}>{description}</Text>
      </View>
      <Text style={styles.quickLinkArrow}>›</Text>
    </TouchableOpacity>
  );
}

function RecentSessionRow({ session }: { session: RecentSession }) {
  const statusVariant =
    session.status === "ended"
      ? "success"
      : session.status === "active"
        ? "info"
        : "neutral";

  return (
    <View style={styles.sessionRow}>
      <View style={styles.sessionRowTop}>
        <View style={styles.sessionMain}>
          <Text style={styles.sessionSubject}>{session.subject}</Text>
          <Text style={styles.sessionTopic}>{session.topic}</Text>
        </View>
        <Badge label={session.status} variant={statusVariant} />
      </View>
      <View style={styles.sessionMeta}>
        <Text style={styles.sessionMetaText}>{session.gradeClass}</Text>
        <Text style={styles.sessionMetaDot}>•</Text>
        <Text style={styles.sessionMetaText}>{session.participantCount} students</Text>
        <Text style={styles.sessionMetaDot}>•</Text>
        <Text style={styles.sessionMetaText}>{formatSessionDate(session.createdAt)}</Text>
      </View>
      <View style={styles.sessionFooter}>
        <Badge
          label={session.synced ? "Synced" : "Local only"}
          variant={session.synced ? "success" : "warning"}
        />
        <Text style={styles.sessionFooterText}>
          {session.confusionIndexAvg != null
            ? `Avg confusion ${session.confusionIndexAvg.toFixed(1)}`
            : "Confusion summary pending"}
        </Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const preferences = usePreferencesStore((state) => ({
    defaultLanguage: state.defaultLanguage,
    defaultLostThreshold: state.defaultLostThreshold,
    defaultSubject: state.defaultSubject,
    defaultGradeClass: state.defaultGradeClass,
    aiProviderEnabled: state.aiProviderEnabled,
    voiceEnabled: state.voiceEnabled,
  }));
  const {
    isConnected,
    supabaseReachable,
    pendingSyncCount,
    failedSyncCount,
    lastSyncAt,
    mode,
    syncInProgress,
    syncProgress,
  } = useNetworkStore();
  const { sessions, isLoading, isRefreshing, isSyncing, lastSyncedAt, syncError, refresh } =
    useRecentSessions({
      limit: 8,
      autoSync: true,
    });

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
      ? { label: "AI ready", variant: "success" as const }
      : preferences.aiProviderEnabled
        ? { label: "AI offline", variant: "warning" as const }
        : { label: "AI off", variant: "neutral" as const };

  const voiceBadge = preferences.voiceEnabled
    ? { label: "Voice ready", variant: "success" as const }
    : { label: "Voice off", variant: "neutral" as const };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void refresh("pull");
            }}
            tintColor={colors.primary[600]}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>ClassPulse AI</Text>
            <Text style={styles.subtitle}>
              {user?.email ? `${user.email} · Teacher home` : "Teacher home"}
            </Text>
          </View>
          <View style={styles.headerBadges}>
            <StatusChip status={isConnected ? "online" : "offline"} />
            <StatusChip status={syncStatus.status} label={syncStatus.label} />
            <Badge label={aiBadge.label} variant={aiBadge.variant} size="md" />
            <Badge label={voiceBadge.label} variant={voiceBadge.variant} size="md" />
          </View>
        </View>

        <View style={styles.columns}>
          <View style={styles.primaryColumn}>
            <Card variant="elevated" padding="lg" style={styles.startCard}>
              <Badge label="Session Launcher" variant="primary" size="md" style={styles.startBadge} />
              <Text style={styles.startTitle}>Start the next class in one tap</Text>
              <Text style={styles.startDescription}>
                Launch a live session with your saved defaults, or switch into offline classroom mode when internet is unreliable.
              </Text>

              <View style={styles.buttonRow}>
                <Button
                  title="Start Session"
                  onPress={() => router.push("/session/create?mode=online")}
                  size="lg"
                  style={styles.primaryHeroButton}
                  textStyle={styles.primaryHeroButtonText}
                />
                <Button
                  title="Offline Classroom Mode"
                  onPress={() => router.push("/session/create?mode=offline")}
                  size="lg"
                  variant="outline"
                  style={styles.secondaryHeroButton}
                  textStyle={styles.secondaryHeroButtonText}
                />
              </View>

              <View style={styles.defaultBar}>
                <Text style={styles.defaultBarText}>
                  Defaults: {preferences.defaultSubject ?? "Subject unset"} ·{" "}
                  {preferences.defaultGradeClass ?? "Class unset"} · {preferences.defaultLanguage} ·{" "}
                  {preferences.defaultLostThreshold}% threshold
                </Text>
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Recent Sessions</Text>
                  <Text style={styles.sectionDescription}>
                    Local SQLite history, refreshed from Supabase whenever you pull or reconnect.
                  </Text>
                </View>
                <Badge
                  label={sessions.length > 0 ? `${sessions.length} recent` : "No sessions yet"}
                  variant={sessions.length > 0 ? "info" : "neutral"}
                  size="md"
                />
              </View>

              {isLoading ? (
                <View style={styles.loadingBlock}>
                  <ActivityIndicator size="large" color={colors.primary[600]} />
                  <Text style={styles.loadingText}>Loading your recent sessions…</Text>
                </View>
              ) : sessions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Your recent list is empty</Text>
                  <Text style={styles.emptyText}>
                    Start a session to create your first local record, then pull to sync from Supabase when online.
                  </Text>
                </View>
              ) : (
                <View style={styles.sessionsList}>
                  {sessions.map((session) => (
                    <RecentSessionRow key={session.id} session={session} />
                  ))}
                </View>
              )}
            </Card>
          </View>

          <View style={styles.secondaryColumn}>
            <Card variant="default" padding="lg" style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Quick Access</Text>
              <Text style={styles.sectionDescription}>
                Jump straight into summaries, weekly patterns, or settings.
              </Text>

              <View style={styles.quickLinks}>
                <QuickLink
                  title="Past Summaries"
                  description="Review recent classroom summaries and synced session history."
                  onPress={() => router.push("/(tabs)/summaries")}
                />
                <QuickLink
                  title="Weekly Patterns"
                  description="See teaching trends built from your recent session archive."
                  onPress={() => router.push("/(tabs)/weekly")}
                />
                <QuickLink
                  title="Offline & Sync"
                  description="Watch queued jobs, retries, and local-first network mode."
                  onPress={() => router.push("/(tabs)/sync")}
                />
                <QuickLink
                  title="Settings"
                  description="Update teacher defaults, AI preferences, and voice tools."
                  onPress={() => router.push("/(tabs)/settings")}
                />
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Sync Status</Text>
              <Text style={styles.sectionDescription}>
                Pull to refresh anytime. Home will also auto-sync recent sessions when the app regains connectivity.
              </Text>

              <View style={styles.syncStatusBlock}>
                <StatusChip status={syncStatus.status} label={syncStatus.label} />
                <Text style={styles.syncStatusText}>
                  {!hasSupabaseConfig
                    ? "Supabase credentials are not configured, so recent sessions are running in local-only mode."
                    : syncInProgress
                      ? `Sync engine is processing ${syncProgress}% of the current queue.`
                      : syncError
                      ? syncError
                      : formatSyncTime(lastSyncAt ?? lastSyncedAt)}
                </Text>
              </View>

              <View style={styles.serviceRow}>
                <Text style={styles.serviceLabel}>Network mode</Text>
                <Badge
                  label={
                    mode === "local_hotspot"
                      ? "Local hotspot"
                      : mode === "offline"
                        ? "Offline"
                        : "Online"
                  }
                  variant={mode === "online" ? "success" : "warning"}
                  size="md"
                />
              </View>
              <View style={styles.serviceRow}>
                <Text style={styles.serviceLabel}>Supabase</Text>
                <StatusChip
                  status={supabaseReachable && hasSupabaseConfig ? "available" : "unavailable"}
                  label={supabaseReachable && hasSupabaseConfig ? "Reachable" : "Unavailable"}
                />
              </View>
              <View style={styles.serviceRow}>
                <Text style={styles.serviceLabel}>Pending sync jobs</Text>
                <Badge
                  label={pendingSyncCount > 0 ? `${pendingSyncCount} queued` : "None queued"}
                  variant={pendingSyncCount > 0 ? "warning" : "success"}
                  size="md"
                />
              </View>
              <View style={styles.serviceRow}>
                <Text style={styles.serviceLabel}>Failed sync jobs</Text>
                <Badge
                  label={failedSyncCount > 0 ? `${failedSyncCount} failed` : "None failed"}
                  variant={failedSyncCount > 0 ? "error" : "success"}
                  size="md"
                />
              </View>
              <View style={styles.serviceRow}>
                <Text style={styles.serviceLabel}>AI provider</Text>
                <Badge label={aiBadge.label} variant={aiBadge.variant} size="md" />
              </View>
              <View style={styles.serviceRow}>
                <Text style={styles.serviceLabel}>Voice service</Text>
                <Badge label={voiceBadge.label} variant={voiceBadge.variant} size="md" />
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
    padding: spacing.xl,
    paddingBottom: spacing["3xl"],
  },
  header: {
    gap: spacing.base,
    marginBottom: spacing["2xl"],
  },
  title: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  headerBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  columns: {
    flexDirection: "row",
    gap: spacing.xl,
    alignItems: "flex-start",
  },
  primaryColumn: {
    flex: 1.4,
    gap: spacing.xl,
  },
  secondaryColumn: {
    flex: 0.95,
    gap: spacing.xl,
  },
  startCard: {
    backgroundColor: colors.dark.background,
    ...shadows.lg,
  },
  startBadge: {
    alignSelf: "flex-start",
    marginBottom: spacing.base,
  },
  startTitle: {
    ...textStyles.displayMedium,
    color: colors.text.inverse,
    marginBottom: spacing.sm,
  },
  startDescription: {
    ...textStyles.bodyLarge,
    color: colors.dark.textSecondary,
    maxWidth: 760,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.base,
    marginTop: spacing.xl,
  },
  primaryHeroButton: {
    backgroundColor: colors.text.inverse,
    borderColor: colors.text.inverse,
    flex: 1,
  },
  primaryHeroButtonText: {
    color: colors.primary[700],
  },
  secondaryHeroButton: {
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.06)",
    flex: 1,
  },
  secondaryHeroButtonText: {
    color: colors.text.inverse,
  },
  defaultBar: {
    marginTop: spacing.xl,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  defaultBarText: {
    ...textStyles.bodySmall,
    color: colors.dark.textSecondary,
  },
  sectionCard: {
    borderRadius: borderRadius["2xl"],
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.base,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  sectionDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
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
  emptyState: {
    paddingVertical: spacing["3xl"],
    alignItems: "center",
  },
  emptyTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.sm,
    maxWidth: 520,
    textAlign: "center",
  },
  sessionsList: {
    gap: spacing.base,
  },
  sessionRow: {
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    backgroundColor: colors.surface.background,
    gap: spacing.sm,
  },
  sessionRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.base,
  },
  sessionMain: {
    flex: 1,
  },
  sessionSubject: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  sessionTopic: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  sessionMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  sessionMetaDot: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
  sessionMetaText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  sessionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.base,
  },
  sessionFooterText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  quickLinks: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  quickLink: {
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    backgroundColor: colors.surface.background,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.base,
  },
  quickLinkTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "600",
  },
  quickLinkDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
    maxWidth: 320,
  },
  quickLinkArrow: {
    ...textStyles.headingLarge,
    color: colors.primary[600],
  },
  syncStatusBlock: {
    marginTop: spacing.lg,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  syncStatusText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  serviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surface.borderLight,
  },
  serviceLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
});
