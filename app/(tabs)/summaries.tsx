import React, { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, Card } from "../../src/components/ui";
import { useSessionSummaries } from "../../src/hooks/useSessionSummaries";
import { colors, spacing, textStyles, borderRadius } from "../../src/theme";

function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

export default function SummariesScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const {
    summaries,
    isLoading,
    isRefreshing,
    isSyncing,
    syncError,
    refresh,
  } = useSessionSummaries({
    limit: 40,
    autoSync: true,
    query,
  });

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void refresh("pull");
            }}
            tintColor={colors.primary[600]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Past Summaries</Text>
            <Text style={styles.subtitle}>
              Browse saved wrap-ups, search by topic or date, and reopen any past session in one tap.
            </Text>
          </View>
          <View style={styles.headerBadges}>
            <Badge
              label={isSyncing ? "Syncing…" : `${summaries.length} saved`}
              variant={isSyncing ? "info" : summaries.length > 0 ? "primary" : "neutral"}
              size="md"
            />
          </View>
        </View>

        <Card variant="default" padding="lg" style={styles.searchCard}>
          <Text style={styles.searchLabel}>Search by topic or date</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Try: fractions, Mar 28, 2026"
            placeholderTextColor={colors.text.tertiary}
            style={styles.searchInput}
          />
          <Text style={styles.searchHint}>
            Search checks subject, topic, saved narrative, suggested opener, and session date.
          </Text>
        </Card>

        {syncError ? (
          <Card variant="outlined" padding="lg" style={styles.errorCard}>
            <Text style={styles.errorTitle}>Summary sync needs attention</Text>
            <Text style={styles.errorText}>{syncError}</Text>
          </Card>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={styles.loadingText}>Loading saved session summaries…</Text>
          </View>
        ) : summaries.length === 0 ? (
          <Card variant="outlined" padding="lg" style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {query.trim()
                ? "No summaries match that search"
                : "Your summary history is empty"}
            </Text>
            <Text style={styles.emptyText}>
              {query.trim()
                ? "Try a broader topic or date search."
                : "End a session to generate the first wrap-up and store it here."}
            </Text>
          </Card>
        ) : (
          <View style={styles.list}>
            {summaries.map((summary) => (
              <Card
                key={summary.id}
                variant="default"
                padding="lg"
                style={styles.summaryCard}
                onPress={() =>
                  router.push({
                    pathname: "/session/summary",
                    params: { sessionId: summary.sessionId },
                  })
                }
              >
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryHeaderCopy}>
                    <Text style={styles.subject}>{summary.subject}</Text>
                    <Text style={styles.topic}>{summary.topic}</Text>
                  </View>
                  <View style={styles.summaryHeaderBadges}>
                    <Badge
                      label={`${summary.overallRecoveryScore} recovery`}
                      variant={
                        summary.overallRecoveryScore >= 75
                          ? "success"
                          : summary.overallRecoveryScore >= 45
                            ? "warning"
                            : "error"
                      }
                      size="md"
                    />
                    <Badge
                      label={summary.synced ? "Synced" : "Local"}
                      variant={summary.synced ? "success" : "warning"}
                      size="md"
                    />
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{summary.gradeClass}</Text>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.metaText}>{summary.totalParticipants} students</Text>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.metaText}>{formatSessionDate(summary.createdAt)}</Text>
                </View>

                <Text style={styles.summaryText} numberOfLines={3}>
                  {summary.aiNarrativeSummary ??
                    "AI summary is still being prepared for this session."}
                </Text>

                <View style={styles.detailRow}>
                  <View style={styles.detailPill}>
                    <Text style={styles.detailPillLabel}>Peaks</Text>
                    <Text style={styles.detailPillValue}>
                      {summary.peakConfusionMoments.length}
                    </Text>
                  </View>
                  <View style={styles.detailPill}>
                    <Text style={styles.detailPillLabel}>Clusters</Text>
                    <Text style={styles.detailPillValue}>{summary.topClusters.length}</Text>
                  </View>
                  <View style={styles.detailPill}>
                    <Text style={styles.detailPillLabel}>Source</Text>
                    <Text style={styles.detailPillValue}>
                      {summary.summarySource === "edge" ? "Edge AI" : "Fallback"}
                    </Text>
                  </View>
                </View>

                {summary.topReasonChips.length > 0 ? (
                  <View style={styles.reasonWrap}>
                    {summary.topReasonChips.slice(0, 3).map((chip) => (
                      <View key={chip.chip} style={styles.reasonChip}>
                        <Text style={styles.reasonChipText}>
                          {formatReasonChip(chip.chip)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.footer}>
                  <Text style={styles.footerText}>
                    Suggested opener:{" "}
                    {summary.suggestedNextActivity ??
                      "Short recap plus a quick confidence check."}
                  </Text>
                  <Button
                    title="Open Summary"
                    variant="ghost"
                    onPress={() =>
                      router.push({
                        pathname: "/session/summary",
                        params: { sessionId: summary.sessionId },
                      })
                    }
                  />
                </View>
              </Card>
            ))}
          </View>
        )}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  headerCopy: {
    flex: 1,
    minWidth: 280,
  },
  headerBadges: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  title: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    maxWidth: 640,
  },
  searchCard: {
    gap: spacing.sm,
  },
  searchLabel: {
    ...textStyles.label,
    color: colors.text.secondary,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    ...textStyles.bodyLarge,
    color: colors.text.primary,
  },
  searchHint: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
  errorCard: {
    borderColor: colors.status.errorBg,
    backgroundColor: colors.status.errorBg,
  },
  errorTitle: {
    ...textStyles.headingSmall,
    color: "#991B1B",
  },
  errorText: {
    ...textStyles.bodySmall,
    color: "#991B1B",
    marginTop: spacing.xs,
  },
  loadingState: {
    paddingVertical: spacing["3xl"],
    alignItems: "center",
    gap: spacing.base,
  },
  loadingText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  emptyCard: {
    alignItems: "center",
  },
  emptyTitle: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
    textAlign: "center",
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 440,
  },
  list: {
    gap: spacing.base,
  },
  summaryCard: {
    gap: spacing.base,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    flexWrap: "wrap",
  },
  summaryHeaderCopy: {
    flex: 1,
    minWidth: 220,
  },
  summaryHeaderBadges: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  subject: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  topic: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaDivider: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
  metaText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  summaryText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  detailPill: {
    minWidth: 92,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.cardHover,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  detailPillLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailPillValue: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: "600",
    marginTop: spacing.xxs,
  },
  reasonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  reasonChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  reasonChipText: {
    ...textStyles.bodySmall,
    color: colors.primary[700],
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "center",
    flexWrap: "wrap",
  },
  footerText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    flex: 1,
    minWidth: 220,
  },
});
