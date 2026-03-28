import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

interface MetricCardProps {
  label: string;
  value: string;
  accentColor: string;
  supporting?: string;
}

export function MetricCard({
  label,
  value,
  accentColor,
  supporting,
}: MetricCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {supporting ? <Text style={styles.supporting}>{supporting}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 148,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surface.borderLight,
    backgroundColor: colors.surface.cardHover,
    gap: spacing.xs,
  },
  accent: {
    width: 36,
    height: 4,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  label: {
    ...textStyles.label,
    color: colors.text.secondary,
  },
  value: {
    ...textStyles.metricSmall,
    color: colors.text.primary,
  },
  supporting: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
});
