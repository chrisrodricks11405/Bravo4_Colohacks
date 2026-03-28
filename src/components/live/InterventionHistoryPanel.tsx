import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { InterventionActionPayload, MisconceptionClusterSummary } from "../../types";
import { Badge, Card } from "../ui";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

interface InterventionHistoryPanelProps {
  clusters: MisconceptionClusterSummary[];
  interventions: InterventionActionPayload[];
}

function formatClockTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatInterventionType(type: InterventionActionPayload["type"]) {
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

function getRecoveryMeta(intervention: InterventionActionPayload) {
  if (intervention.confusionAfter == null || intervention.recoveryScore == null) {
    return {
      badgeLabel: "Measuring",
      badgeVariant: "info" as const,
      deltaLabel: `${intervention.recoveryWindowSeconds}s window`,
    };
  }

  if (intervention.recoveryScore > 0) {
    return {
      badgeLabel: "Recovered",
      badgeVariant: "success" as const,
      deltaLabel: `-${intervention.recoveryScore.toFixed(1)} confusion`,
    };
  }

  return {
    badgeLabel: "No drop",
    badgeVariant: "error" as const,
    deltaLabel: `+${Math.abs(intervention.recoveryScore).toFixed(1)} confusion`,
  };
}

export function InterventionHistoryPanel({
  clusters,
  interventions,
}: InterventionHistoryPanelProps) {
  const clusterMap = useMemo(
    () => new Map(clusters.map((cluster) => [cluster.id, cluster])),
    [clusters]
  );
  const history = [...interventions].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp)
  );

  return (
    <Card variant="default" padding="lg" style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Intervention History</Text>
          <Text style={styles.subtitle}>
            Each action stays tied to its cluster, time stamp, and measurable recovery delta.
          </Text>
        </View>
        <Badge
          label={history.length > 0 ? `${history.length} logged` : "No actions yet"}
          variant={history.length > 0 ? "primary" : "neutral"}
          size="md"
        />
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
      >
        {history.length === 0 ? (
          <Text style={styles.emptyText}>
            Logged interventions will appear here as soon as you mark the first classroom action.
          </Text>
        ) : (
          history.map((intervention) => {
            const linkedCluster = intervention.clusterId
              ? clusterMap.get(intervention.clusterId)
              : undefined;
            const recoveryMeta = getRecoveryMeta(intervention);

            return (
              <View key={intervention.id} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <View style={styles.historyHeaderCopy}>
                    <Text style={styles.historyTitle}>
                      {formatInterventionType(intervention.type)}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {formatClockTime(intervention.timestamp)}
                      {linkedCluster ? ` · ${linkedCluster.title}` : ""}
                    </Text>
                  </View>
                  <Badge
                    label={recoveryMeta.badgeLabel}
                    variant={recoveryMeta.badgeVariant}
                    size="sm"
                  />
                </View>

                <View style={styles.metricRow}>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Before</Text>
                    <Text style={styles.metricValue}>
                      {intervention.confusionBefore.toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>After</Text>
                    <Text style={styles.metricValue}>
                      {intervention.confusionAfter != null
                        ? intervention.confusionAfter.toFixed(1)
                        : "Pending"}
                    </Text>
                  </View>
                  <View style={styles.metricBlock}>
                    <Text style={styles.metricLabel}>Delta</Text>
                    <Text style={styles.metricValue}>{recoveryMeta.deltaLabel}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.base,
    minWidth: 320,
    minHeight: 420,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    flexWrap: "wrap",
  },
  title: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    maxWidth: 560,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    gap: spacing.base,
    paddingBottom: spacing.xs,
  },
  emptyText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
  historyItem: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.cardHover,
    gap: spacing.base,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  historyHeaderCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  historyTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  historyMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metricBlock: {
    flex: 1,
    minWidth: 96,
    padding: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.card,
  },
  metricLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
  },
  metricValue: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: "700",
    marginTop: spacing.xxs,
  },
});
