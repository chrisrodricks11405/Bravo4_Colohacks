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
import { borderRadius, colors, shadows, spacing, textStyles } from "../../src/theme";

function formatSessionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

function formatReasonChip(chip: string) {
  const map: Record<string, string> = {
    step_unclear: "Steps unclear",
    language_friction: "Language friction",
    missing_prerequisite: "Missing prerequisite",
    too_fast: "Too fast",
    notation_confusion: "Notation confusion",
    example_needed: "Example needed",
  };
  return map[chip] ?? "Other";
}

function RecoveryRing({ score }: { score: number }) {
  const color = score >= 75 ? colors.status.success : score >= 45 ? colors.status.warning : colors.status.error;
  return (
    <View style={[styles.recoveryRing, { borderColor: color }]}>
      <Text style={[styles.recoveryScore, { color }]}>{score}%</Text>
    </View>
  );
}

export default function SummariesScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { summaries, isLoading, isRefreshing, isSyncing, syncError, refresh } =
    useSessionSummaries({ limit: 40, autoSync: true, query });

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => { void refresh("pull"); }} tintColor={colors.primary[600]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Session History</Text>
            <Text style={styles.subtitle}>Review past sessions and what students struggled with</Text>
          </View>
          <Badge
            label={isSyncing ? "Syncing…" : `${summaries.length} saved`}
            variant={isSyncing ? "info" : summaries.length > 0 ? "primary" : "neutral"}
            size="md"
          />
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by topic, subject, or date..."
            placeholderTextColor={colors.text.tertiary}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Button title="✕" variant="ghost" size="sm" onPress={() => setQuery("")} />
          )}
        </View>

        {syncError ? (
          <Card variant="default" padding="lg" style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not load summaries</Text>
            <Text style={styles.errorText}>{syncError}</Text>
          </Card>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={styles.loadingText}>Loading saved summaries…</Text>
          </View>
        ) : summaries.length === 0 ? (
          <Card variant="tonal" padding="xl" style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {query.trim() ? "No sessions match your search" : "No sessions yet"}
            </Text>
            <Text style={styles.emptyText}>
              {query.trim() ? "Try a different search term." : "Complete your first session to see a summary here."}
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
                  router.push({ pathname: "/session/summary", params: { sessionId: summary.sessionId } })
                }
              >
                {/* Top row */}
                <View style={styles.summaryTop}>
                  <View style={styles.summaryTopLeft}>
                    <Text style={styles.summarySubject}>{summary.subject}</Text>
                    <Text style={styles.summaryTopic}>{summary.topic}</Text>
                  </View>
                  <RecoveryRing score={summary.overallRecoveryScore} />
                </View>

                {/* Meta row */}
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{summary.gradeClass}</Text>
                  <Text style={styles.metaDivider}>·</Text>
                  <Text style={styles.metaText}>{summary.totalParticipants} students</Text>
                  <Text style={styles.metaDivider}>·</Text>
                  <Text style={styles.metaText}>{formatSessionDate(summary.createdAt)}</Text>
                </View>

                {/* Narrative */}
                <Text style={styles.narrative} numberOfLines={3}>
                  {summary.aiNarrativeSummary ?? "AI summary is still being prepared."}
                </Text>

                {/* Detail pills */}
                <View style={styles.pillRow}>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{summary.peakConfusionMoments.length} Key Moments</Text>
                  </View>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{summary.topClusters.length} Topics</Text>
                  </View>
                </View>

                {/* Reason chips */}
                {summary.topReasonChips.length > 0 ? (
                  <View style={styles.reasonRow}>
                    {summary.topReasonChips.slice(0, 3).map((chip) => (
                      <View key={chip.chip} style={styles.reasonChip}>
                        <Text style={styles.reasonChipText}>{formatReasonChip(chip.chip)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Footer */}
                <View style={styles.footer}>
                  <Text style={styles.footerText} numberOfLines={1}>
                    Next step: {summary.suggestedNextActivity ?? "Quick recap + confidence check"}
                  </Text>
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
    gap: spacing.lg,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerCopy: {
    flex: 1,
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

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.card,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.base,
    ...shadows.sm,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.base,
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },

  // Error
  errorCard: {
    backgroundColor: colors.status.errorBg,
    borderRadius: borderRadius.xl,
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

  // Loading
  loadingState: {
    paddingVertical: spacing["3xl"],
    alignItems: "center",
    gap: spacing.base,
  },
  loadingText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },

  // Empty
  emptyCard: {
    alignItems: "center",
    borderRadius: borderRadius["2xl"],
  },
  emptyTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
    textAlign: "center",
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 400,
  },

  // Summary list
  list: {
    gap: spacing.md,
  },
  summaryCard: {
    borderRadius: borderRadius["2xl"],
    gap: spacing.md,
  },

  // Summary card content
  summaryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  summaryTopLeft: {
    flex: 1,
  },
  summarySubject: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  summaryTopic: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },

  // Recovery ring
  recoveryRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  recoveryScore: {
    ...textStyles.bodyMedium,
    fontWeight: "800",
  },

  // Meta
  metaRow: {
    flexDirection: "row",
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

  // Narrative
  narrative: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    lineHeight: 22,
  },

  // Pills
  pillRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface.backgroundAlt,
  },
  pillText: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontWeight: "600",
  },

  // Reason chips
  reasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  reasonChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
  },
  reasonChipText: {
    ...textStyles.caption,
    color: colors.primary[700],
    fontWeight: "600",
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.base,
  },
  footerText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    flex: 1,
    fontStyle: "italic",
  },
});
