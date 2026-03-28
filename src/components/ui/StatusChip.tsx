import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, borderRadius, textStyles } from "../../theme";

type ChipStatus = "online" | "offline" | "syncing" | "error" | "available" | "unavailable";

interface StatusChipProps {
  status: ChipStatus;
  label?: string;
}

const statusConfig: Record<ChipStatus, { color: string; bg: string; dotColor: string; defaultLabel: string }> = {
  online: { color: "#065F46", bg: colors.status.successBg, dotColor: colors.status.success, defaultLabel: "Online" },
  offline: { color: "#92400E", bg: colors.status.warningBg, dotColor: colors.status.warning, defaultLabel: "Offline" },
  syncing: { color: "#1E40AF", bg: colors.status.infoBg, dotColor: colors.status.info, defaultLabel: "Syncing" },
  error: { color: "#991B1B", bg: colors.status.errorBg, dotColor: colors.status.error, defaultLabel: "Error" },
  available: { color: "#065F46", bg: colors.status.successBg, dotColor: colors.status.success, defaultLabel: "Available" },
  unavailable: { color: colors.text.tertiary, bg: colors.surface.backgroundAlt, dotColor: colors.text.tertiary, defaultLabel: "Unavailable" },
};

export function StatusChip({ status, label }: StatusChipProps) {
  const config = statusConfig[status];

  return (
    <View style={[styles.container, { backgroundColor: config.bg }]}>
      <View style={[styles.dot, { backgroundColor: config.dotColor }]} />
      <Text style={[styles.label, { color: config.color }]}>
        {label ?? config.defaultLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: spacing.xs + 1,
  },
  label: {
    ...textStyles.caption,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
