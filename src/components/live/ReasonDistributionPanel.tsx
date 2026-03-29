import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

export type ReasonCount = {
  reason: string;
  count: number;
};

interface ReasonDistributionPanelProps {
  distribution: ReasonCount[];
}

const reasonLabels: Record<string, string> = {
  need_example: "Need example",
  too_fast: "Too fast",
  step_unclear: "Step unclear",
  didnt_hear: "Didn't hear",
  language_issue: "Language issue",
  other: "Other",
};

const reasonColors: Record<string, string> = {
  need_example: colors.primary[500],
  too_fast: colors.pulse.lost,
  step_unclear: colors.pulse.sortOf,
  didnt_hear: colors.status.info,
  language_issue: "#8B5CF6",
  other: colors.text.tertiary,
};

function getLabel(reason: string) {
  return reasonLabels[reason] ?? reason;
}

function getColor(reason: string) {
  return reasonColors[reason] ?? colors.text.tertiary;
}

export function ReasonDistributionPanel({
  distribution,
}: ReasonDistributionPanelProps) {
  if (distribution.length === 0) {
    return null;
  }

  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Why students are lost</Text>
      <Text style={styles.subtitle}>
        {total} reason{total !== 1 ? "s" : ""} reported
      </Text>
      <View style={styles.barTrack}>
        {distribution.map((item) => {
          const widthPercent = (item.count / total) * 100;
          if (widthPercent < 1) {
            return null;
          }

          return (
            <View
              key={item.reason}
              style={[
                styles.barSegment,
                {
                  width: `${widthPercent}%`,
                  backgroundColor: getColor(item.reason),
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.legendGrid}>
        {distribution.map((item) => {
          const percent = Math.round((item.count / total) * 100);
          return (
            <View key={item.reason} style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: getColor(item.reason) },
                ]}
              />
              <Text style={styles.legendLabel} numberOfLines={1}>
                {getLabel(item.reason)}
              </Text>
              <Text style={styles.legendValue}>
                {item.count} ({percent}%)
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    ...textStyles.label,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
  barTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: borderRadius.full,
    overflow: "hidden",
    backgroundColor: colors.surface.borderLight,
  },
  barSegment: {
    height: "100%",
  },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minWidth: 120,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  legendValue: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
});
