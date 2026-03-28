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
  if (!value) {
    return "Not synced yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getModeBadge(mode: "online" | "offline" | "local_hotspot") {
  switch (mode) {
    case "local_hotspot":
      return { label: "Local hotspot", status: "offline" as const };
    case "offline":
      return { label: "Offline", status: "offline" as const };
    default:
      return { label: "Online", status: "online" as const };
  }
}

function StatTile({
  label,
  value,
  supporting,
}: {
  label: string;
  value: string;
  supporting: string;
}) {
  return (
    <Card variant="default" padding="lg" style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSupporting}>{supporting}</Text>
    </Card>
  );
}

export default function SyncScreen() {
  const {
    error,
    exportData,
    forceSync,
    isForceSyncing,
    isLoading,
    isRefreshing,
    isRetryingFailed,
    jobs,
    overview,
    refresh,
    retryFailed,
  } = useSyncDashboard();
  const {
    mode,
    syncInProgress,
    syncProgress,
    syncCompletedJobs,
    syncTotalJobs,
    pendingSyncCount,
    failedSyncCount,
    localQueueCount,
  } = useNetworkStore();

  const modeBadge = getModeBadge(mode);

  const handleExport = async () => {
    try {
      const payload = await exportData();
      Clipboard.setString(payload);
      Alert.alert("Copied", "Sync diagnostics were copied to the clipboard.");
    } catch (copyError) {
      Alert.alert(
        "Export unavailable",
        copyError instanceof Error
          ? copyError.message
          : "Try again in a moment."
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void refresh(true);
            }}
            tintColor={colors.primary[600]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Offline & Sync</Text>
            <Text style={styles.subtitle}>
              Watch queued classroom data, retry failed jobs, and force a fresh sync when connectivity returns.
            </Text>
          </View>
          <View style={styles.headerBadges}>
            <StatusChip status={modeBadge.status} label={modeBadge.label} />
            <StatusChip
              status={syncInProgress ? "syncing" : failedSyncCount > 0 ? "error" : "available"}
              label={
                syncInProgress
                  ? `Syncing ${syncProgress}%`
                  : failedSyncCount > 0
                    ? "Needs retry"
                    : "Healthy"
              }
            />
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatTile
            label="Local queue"
            value={String(localQueueCount)}
            supporting="Unsynced local records waiting to upload."
          />
          <StatTile
            label="Pending jobs"
            value={String(pendingSyncCount)}
            supporting="Batch sync jobs still in the queue."
          />
          <StatTile
            label="Failed jobs"
            value={String(failedSyncCount)}
            supporting="Jobs currently scheduled for retry."
          />
          <StatTile
            label="Last sync"
            value={formatTimestamp(overview?.lastSyncAt ?? null)}
            supporting="Most recent completed sync run."
          />
        </View>

        <Card variant="elevated" padding="lg" style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.sectionTitle}>Sync engine</Text>
              <Text style={styles.sectionDescription}>
                Automatic retry with exponential backoff keeps classroom data moving once internet is back.
              </Text>
            </View>
            <Badge
              label={
                overview?.nextRetryAt
                  ? `Next retry ${formatTimestamp(overview.nextRetryAt)}`
                  : "No retries scheduled"
              }
              variant={overview?.nextRetryAt ? "warning" : "success"}
              size="md"
            />
          </View>

          <View style={styles.progressRail}>
            <View style={[styles.progressFill, { width: `${syncProgress}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {syncInProgress
              ? `${syncCompletedJobs}/${syncTotalJobs || 0} jobs processed`
              : overview
                ? `${overview.completedJobs} jobs completed so far`
                : "Waiting for sync state"}
          </Text>

          <View style={styles.buttonRow}>
            <Button
              title="Force Sync"
              onPress={() => {
                void forceSync();
              }}
              loading={isForceSyncing}
              style={styles.primaryButton}
            />
            <Button
              title="Retry Failed"
              onPress={() => {
                void retryFailed();
              }}
              loading={isRetryingFailed}
              disabled={failedSyncCount === 0}
              variant="outline"
              style={styles.secondaryButton}
            />
            <Button
              title="Export"
              onPress={() => {
                void handleExport();
              }}
              variant="ghost"
              style={styles.secondaryButton}
            />
          </View>
        </Card>

        {error ? (
          <Card variant="default" padding="lg" style={styles.errorCard}>
            <Text style={styles.errorTitle}>Sync diagnostics need attention</Text>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        <Card variant="default" padding="lg" style={styles.queueCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Queued jobs</Text>
              <Text style={styles.sectionDescription}>
                Sessions and summaries favor the server as the source of aggregate truth. Event streams merge by id.
              </Text>
            </View>
            <Badge
              label={jobs.length > 0 ? `${jobs.length} visible` : "Queue empty"}
              variant={jobs.length > 0 ? "info" : "neutral"}
              size="md"
            />
          </View>

          {isLoading ? (
            <Text style={styles.emptyText}>Loading sync queue…</Text>
          ) : jobs.length === 0 ? (
            <Text style={styles.emptyText}>
              No sync jobs are waiting right now. Classroom data is either local-only or already caught up.
            </Text>
          ) : (
            <View style={styles.jobList}>
              {jobs.map((job) => (
                <View key={job.id} style={styles.jobRow}>
                  <View style={styles.jobCopy}>
                    <Text style={styles.jobType}>{job.type.replace(/_/g, " ")}</Text>
                    <Text style={styles.jobMeta}>
                      Created {formatTimestamp(job.createdAt)}
                    </Text>
                    {job.error ? (
                      <Text style={styles.jobError}>{job.error}</Text>
                    ) : null}
                  </View>
                  <View style={styles.jobStatus}>
                    <Badge
                      label={job.status.replace(/_/g, " ")}
                      variant={
                        job.status === "completed"
                          ? "success"
                          : job.status === "failed"
                            ? "error"
                            : job.status === "in_progress"
                              ? "info"
                              : "warning"
                      }
                      size="md"
                    />
                    <Text style={styles.jobRetry}>Retries {job.retryCount}</Text>
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
    gap: spacing.xl,
  },
  header: {
    gap: spacing.base,
  },
  title: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    maxWidth: 760,
  },
  headerBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  statTile: {
    minWidth: 220,
    flexGrow: 1,
    borderRadius: borderRadius.xl,
  },
  statLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  statValue: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  statSupporting: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  progressCard: {
    borderRadius: borderRadius["2xl"],
    ...shadows.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.base,
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
    maxWidth: 680,
  },
  progressRail: {
    height: 10,
    marginTop: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.borderLight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary[600],
  },
  progressLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  primaryButton: {
    minWidth: 140,
  },
  secondaryButton: {
    minWidth: 140,
  },
  errorCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.status.errorBg,
  },
  errorTitle: {
    ...textStyles.bodyLarge,
    color: "#991B1B",
    fontWeight: "700",
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  queueCard: {
    borderRadius: borderRadius["2xl"],
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  jobList: {
    gap: spacing.sm,
  },
  jobRow: {
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    backgroundColor: colors.surface.background,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  jobCopy: {
    flex: 1,
  },
  jobType: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  jobMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  jobError: {
    ...textStyles.bodySmall,
    color: "#991B1B",
    marginTop: spacing.sm,
  },
  jobStatus: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  jobRetry: {
    ...textStyles.caption,
    color: colors.text.tertiary,
  },
});
