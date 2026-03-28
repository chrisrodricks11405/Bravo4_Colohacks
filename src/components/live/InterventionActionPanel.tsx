import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { InterventionType } from "../../types";
import { Badge, Card } from "../ui";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

const RECOVERY_WINDOWS = [30, 60, 90, 120] as const;

const ACTIONS: Array<{
  type: InterventionType;
  title: string;
  description: string;
}> = [
  {
    type: "reteach",
    title: "Reteach",
    description: "Restart the explanation with a simpler sequence.",
  },
  {
    type: "example",
    title: "Example",
    description: "Add a worked example or visual walkthrough.",
  },
  {
    type: "poll",
    title: "Poll",
    description: "Check understanding with a quick pulse poll.",
  },
  {
    type: "language_switch",
    title: "Language switch",
    description: "Repeat the key idea in a more familiar language.",
  },
  {
    type: "pause",
    title: "Pause",
    description: "Slow down and give the room a reset moment.",
  },
];

interface InterventionActionPanelProps {
  activeClusterTitle?: string;
  pendingCount: number;
  recoveryWindowSeconds: number;
  onRunIntervention: (type: InterventionType) => void;
  onSelectRecoveryWindow: (seconds: number) => void;
}

export function InterventionActionPanel({
  activeClusterTitle,
  pendingCount,
  recoveryWindowSeconds,
  onRunIntervention,
  onSelectRecoveryWindow,
}: InterventionActionPanelProps) {
  return (
    <Card variant="default" padding="lg" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.badgeRow}>
            <Badge label="Zone H" variant="primary" size="md" />
            <Badge
              label={pendingCount > 0 ? `${pendingCount} measuring` : "Loop ready"}
              variant={pendingCount > 0 ? "info" : "success"}
              size="md"
            />
          </View>
          <Text style={styles.title}>Intervention Loop</Text>
          <Text style={styles.subtitle}>
            Mark the exact move you used, then let the dashboard measure whether confusion settled afterward.
          </Text>
        </View>
      </View>

      <View style={styles.contextCard}>
        <Text style={styles.contextLabel}>Triggered by cluster</Text>
        <Text style={styles.contextValue}>
          {activeClusterTitle ?? "No cluster linked right now"}
        </Text>
        <Text style={styles.contextSupporting}>
          {activeClusterTitle
            ? "New interventions will attach to the focused misconception cluster."
            : "You can still log an action even before one cluster becomes dominant."}
        </Text>
      </View>

      <View style={styles.windowSection}>
        <Text style={styles.sectionLabel}>Recovery window</Text>
        <View style={styles.windowRow}>
          {RECOVERY_WINDOWS.map((seconds) => {
            const isSelected = recoveryWindowSeconds === seconds;

            return (
              <TouchableOpacity
                key={seconds}
                activeOpacity={0.85}
                onPress={() => onSelectRecoveryWindow(seconds)}
                style={[styles.windowChip, isSelected && styles.windowChipSelected]}
              >
                <Text style={[styles.windowChipText, isSelected && styles.windowChipTextSelected]}>
                  {seconds}s
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.actionGrid}>
        {ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.type}
            activeOpacity={0.88}
            onPress={() => onRunIntervention(action.type)}
            style={styles.actionCard}
          >
            <Text style={styles.actionTitle}>{action.title}</Text>
            <Text style={styles.actionDescription}>{action.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.lg,
    minWidth: 320,
  },
  header: {
    gap: spacing.base,
  },
  headerCopy: {
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  title: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  contextCard: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    gap: spacing.xs,
  },
  contextLabel: {
    ...textStyles.label,
    color: "#166534",
  },
  contextValue: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "700",
  },
  contextSupporting: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  windowSection: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...textStyles.label,
    color: colors.text.secondary,
  },
  windowRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  windowChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.cardHover,
  },
  windowChipSelected: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  windowChipText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "700",
  },
  windowChipTextSelected: {
    color: colors.text.inverse,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  actionCard: {
    flexGrow: 1,
    minWidth: 180,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.cardHover,
    borderWidth: 1,
    borderColor: colors.surface.border,
    gap: spacing.xs,
  },
  actionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  actionDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
});
