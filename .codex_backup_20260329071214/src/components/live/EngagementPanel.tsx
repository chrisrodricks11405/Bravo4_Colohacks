import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { borderRadius, colors, spacing, textStyles } from "../../theme";
import { Card } from "../ui";
import type { SessionEngagementSnapshot } from "../../services/studentEngagement";

interface EngagementPanelProps {
  snapshot: SessionEngagementSnapshot | null;
}

export function EngagementPanel({ snapshot }: EngagementPanelProps) {
  if (!snapshot) {
    return null;
  }

  return (
    <Card variant="default" padding="lg" style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Heartbeat and engagement</Text>
          <Text style={styles.subtitle}>
            Active devices, signal mix, and a simple leaderboard refresh live every few seconds.
          </Text>
        </View>
        <View style={styles.scoreChip}>
          <Text style={styles.scoreChipLabel}>Score</Text>
          <Text style={styles.scoreChipValue}>{snapshot.engagementScore}</Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Active</Text>
          <Text style={styles.metricValue}>{snapshot.activeCount}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Disconnected</Text>
          <Text style={styles.metricValue}>{snapshot.disconnectedCount}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Avg screen sec</Text>
          <Text style={styles.metricValue}>{snapshot.averageScreenSeconds}</Text>
        </View>
      </View>

      <View style={styles.signalRow}>
        <SignalPill label="Got it" value={snapshot.signalMix.gotIt} tone="success" />
        <SignalPill label="Sort of" value={snapshot.signalMix.sortOf} tone="warning" />
        <SignalPill label="Lost" value={snapshot.signalMix.lost} tone="danger" />
        <SignalPill label="Silent" value={snapshot.signalMix.silent} tone="neutral" />
      </View>

      <View style={styles.board}>
        <Text style={styles.boardTitle}>Session leaderboard</Text>
        {snapshot.leaderboard.map((entry, index) => (
          <View key={entry.anonymousId} style={styles.boardRow}>
            <Text style={styles.boardRank}>{index + 1}</Text>
            <Text style={styles.boardStudent}>Student {entry.anonymousId.slice(-4)}</Text>
            <Text style={styles.boardMeta}>
              {entry.score} pts · {entry.questions} Q · {entry.pollResponses} polls
            </Text>
          </View>
        ))}
        {snapshot.leaderboard.length === 0 ? (
          <Text style={styles.empty}>
            The leaderboard will populate once heartbeat, question, and poll activity starts arriving.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

function SignalPill(props: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const backgroundColor =
    props.tone === "success"
      ? colors.status.successSoft
      : props.tone === "warning"
        ? colors.status.warningSoft
        : props.tone === "danger"
          ? colors.status.errorSoft
          : colors.surface.backgroundAlt;

  return (
    <View style={[styles.signalPill, { backgroundColor }]}>
      <Text style={styles.signalLabel}>{props.label}</Text>
      <Text style={styles.signalValue}>{props.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  title: {
    ...textStyles.titleMd,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodySm,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  scoreChip: {
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  scoreChipLabel: {
    ...textStyles.labelSm,
    color: colors.primary[600],
  },
  scoreChipValue: {
    ...textStyles.titleMd,
    color: colors.primary[700],
  },
  metricRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.backgroundAlt,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricLabel: {
    ...textStyles.labelSm,
    color: colors.text.tertiary,
  },
  metricValue: {
    ...textStyles.titleMd,
    color: colors.text.primary,
  },
  signalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  signalPill: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  signalLabel: {
    ...textStyles.labelSm,
    color: colors.text.secondary,
  },
  signalValue: {
    ...textStyles.labelLg,
    color: colors.text.primary,
  },
  board: {
    gap: spacing.sm,
  },
  boardTitle: {
    ...textStyles.labelLg,
    color: colors.text.secondary,
  },
  boardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.backgroundAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  boardRank: {
    ...textStyles.labelLg,
    color: colors.primary[700],
    width: 20,
  },
  boardStudent: {
    ...textStyles.bodyMd,
    color: colors.text.primary,
    flex: 1,
  },
  boardMeta: {
    ...textStyles.bodySm,
    color: colors.text.tertiary,
  },
  empty: {
    ...textStyles.bodySm,
    color: colors.text.tertiary,
  },
});
