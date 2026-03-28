import React from "react";
import {
  Alert,
  Clipboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, Card, StatusChip } from "../../src/components/ui";
import { useSyncDashboard } from "../../src/hooks/useSyncDashboard";
import { useNetworkStore } from "../../src/stores";
import { borderRadius, colors, shadows, spacing, textStyles } from "../../src/theme";

function formatTimestamp(value: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

function getModeBadge(mode: "online" | "offline" | "local_hotspot") {
  switch (mode) {
    case "local_hotspot":
      return { label: "Local hotspot", status: "offline" as const };
    case "offline":
      return { label: "Offline", status: "offline" as const };
    default:
      return { label: "Online Mode", status: "online" as const };
  }
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card variant="default" padding="lg" style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
    </Card>
  );
}

function getJobIcon(type: string) {
  if (type.includes("sentiment") || type.includes("analysis")) return "✨";
  if (type.includes("attendance") || type.includes("sync")) return "📡";
  if (type.includes("report") || type.includes("student")) return "📄";
  if (type.includes("ocr") || type.includes("whiteboard")) return "🖼";
  return "📋";
}

export default function SyncScreen() {
  const {
    error, exportData, forceSync, isForceSyncing, isLoading,
    isRefreshing, isRetryingFailed, jobs, overview, refresh, retryFailed,
  } = useSyncDashboard();
  const {
    mode, syncInProgress, syncProgress, syncCompletedJobs, syncTotalJobs,
    pendingSyncCount, failedSyncCount, localQueueCount,
  } = useNetworkStore();

  const modeBadge = getModeBadge(mode);

  const handleExport = async () => {
    try {
      const payload = await exportData();
      Clipboard.setString(payload);
      Alert.alert("Copied", "Sync diagnostics copied to clipboard.");
    } catch (copyError) {
      Alert.alert("Export unavailable", copyError instanceof Error ? copyError.message : "Try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => { void refresh(true); }} tintColor={colors.primary[600]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Offline & Sync</Text>
            <Text style={styles.subtitle}>Manage local classroom data and cloud synchronization.</Text>
          </View>
          <View style={styles.headerBadges}>
            <StatusChip status={modeBadge.status} label={modeBadge.label} />
            <StatusChip
              status={syncInProgress ? "syncing" : failedSyncCount > 0 ? "error" : "available"}
              label={syncInProgress ? `Syncing ${syncProgress}%` : failedSyncCount > 0 ? "Needs retry" : "Healthy"}
            />
          </View>
        </View>

        {/* Stat tiles */}
        <View style={styles.statGrid}>
          <StatTile label="LOCAL QUEUE" value={String(localQueueCount)} />
          <StatTile label="PENDING JOBS" value={String(pendingSyncCount)} color={pendingSyncCount > 0 ? colors.primary[600] : undefined} />
          <StatTile label="FAILED JOBS" value={String(failedSyncCount)} color={failedSyncCount > 0 ? colors.status.error : undefined} />
          <StatTile label="LAST SYNC" value={formatTimestamp(overview?.lastSyncAt ?? null)} />
        </View>

        {/* Syncing Queue */}
        <Card variant="default" padding="xl" style={styles.syncCard}>
          <View style={styles.syncHeader}>
            <View>
              <Text style={styles.cardTitle}>Syncing Queue</Text>
              <Text style={styles.cardSubtitle}>Processing current batch of classroom insights</Text>
            </View>
            <Text style={styles.syncCount}>
              <Text style={{ color: colors.primary[600], fontWeight: "700" }}>
                {syncInProgress ? `${syncCompletedJobs}/${syncTotalJobs || 0}` : `${overview?.completedJobs ?? 0}`}
              </Text>
              {" jobs"}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressRail}>
            <View style={[styles.progressFill, { width: `${syncProgress}%` }]} />
          </View>

          <View style={styles.syncActions}>
            <Button
              title="Force Sync"
              onPress={() => { void forceSync(); }}
              loading={isForceSyncing}
              size="md"
              style={styles.syncPrimaryButton}
              icon={<Text style={{ color: colors.text.inverse, fontSize: 14 }}>🔄</Text>}
            />
            <Button
              title="Retry Failed"
              onPress={() => { void retryFailed(); }}
              loading={isRetryingFailed}
              disabled={failedSyncCount === 0}
              variant="outline"
              size="md"
              icon={<Text style={{ fontSize: 14 }}>↻</Text>}
            />
            <Button
              title="Export Diagnostics"
              onPress={() => { void handleExport(); }}
              variant="ghost"
              size="md"
              icon={<Text style={{ fontSize: 14 }}>📋</Text>}
            />
          </View>
        </Card>

        {error ? (
          <Card variant="default" padding="lg" style={styles.errorCard}>
            <Text style={styles.errorTitle}>Sync diagnostics need attention</Text>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        {/* Active Queue Log */}
        <Card variant="default" padding="xl" style={styles.queueCard}>
          <View style={styles.queueHeader}>
            <Text style={styles.cardTitle}>Active Queue Log</Text>
            <Badge label="Real-time update" variant="neutral" size="sm" />
          </View>

          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 2 }]}>JOB TYPE</Text>
            <Text style={[styles.tableHeaderText, { flex: 1 }]}>CREATED</Text>
            <Text style={[styles.tableHeaderText, { flex: 1, textAlign: "right" }]}>STATUS</Text>
          </View>

          {isLoading ? (
            <Text style={styles.emptyText}>Loading sync queue…</Text>
          ) : jobs.length === 0 ? (
            <Text style={styles.emptyText}>No sync jobs waiting. All caught up.</Text>
          ) : (
            <View style={styles.jobList}>
              {jobs.map((job) => (
                <View key={job.id} style={styles.jobRow}>
                  <View style={[styles.jobCell, { flex: 2, flexDirection: "row", alignItems: "center", gap: spacing.md }]}>
                    <Text style={styles.jobIcon}>{getJobIcon(job.type)}</Text>
                    <View>
                      <Text style={styles.jobType}>{job.type.replace(/_/g, " ")}</Text>
                      {job.error ? <Text style={styles.jobError} numberOfLines={1}>{job.error}</Text> : null}
                    </View>
                  </View>
                  <Text style={[styles.jobCell, styles.jobTime, { flex: 1 }]}>
                    {formatTimestamp(job.createdAt)}
                  </Text>
                  <View style={[styles.jobCell, { flex: 1, alignItems: "flex-end" }]}>
                    <Badge
                      label={job.status === "in_progress" ? "Processing" : job.status.replace(/_/g, " ")}
                      variant={
                        job.status === "completed" ? "success"
                          : job.status === "failed" ? "error"
                          : job.status === "in_progress" ? "info"
                          : "warning"
                      }
                      size="sm"
                      dot
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
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
    maxWidth: 960,
    alignSelf: "center",
    width: "100%",
    gap: spacing.lg,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.base,
  },
  title: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  headerBadges: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },

  // Stat grid
  statGrid: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statTile: {
    flex: 1,
    borderRadius: borderRadius.xl,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  statValue: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },

  // Sync card
  syncCard: {
    borderRadius: borderRadius["2xl"],
  },
  syncHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  cardSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  syncCount: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  progressRail: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.backgroundAlt,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.full,
  },
  syncActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  syncPrimaryButton: {
    minWidth: 140,
  },

  // Error
  errorCard: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.status.errorBg,
  },
  errorTitle: {
    ...textStyles.bodyLarge,
    color: "#991B1B",
    fontWeight: "700",
  },
  errorText: {
    ...textStyles.bodySmall,
    color: "#991B1B",
    marginTop: spacing.xs,
  },

  // Queue
  queueCard: {
    borderRadius: borderRadius["2xl"],
  },
  queueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.backgroundAlt,
  },
  tableHeaderText: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    paddingVertical: spacing.xl,
  },
  jobList: {
    gap: 0,
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.backgroundAlt,
  },
  jobCell: {},
  jobIcon: {
    fontSize: 18,
  },
  jobType: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  jobTime: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  jobError: {
    ...textStyles.caption,
    color: "#991B1B",
    marginTop: spacing.xxs,
  },
});
