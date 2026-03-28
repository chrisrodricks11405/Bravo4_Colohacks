import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, borderRadius, textStyles } from "../../theme";

type ChipStatus = "online" | "offline" | "syncing" | "error" | "available" | "unavailable";

interface StatusChipProps {
  status: ChipStatus;
  label?: string;
}

const statusConfig: Record<ChipStatus, { color: string; bg: string; defaultLabel: string }> = {
  online: { color: "#065F46", bg: colors.status.successBg, defaultLabel: "Online" },
  offline: { color: "#92400E", bg: colors.status.warningBg, defaultLabel: "Offline" },
  syncing: { color: "#1E40AF", bg: colors.status.infoBg, defaultLabel: "Syncing" },
  error: { color: "#991B1B", bg: colors.status.errorBg, defaultLabel: "Error" },
  available: { color: "#065F46", bg: colors.status.successBg, defaultLabel: "Available" },
  unavailable: { color: colors.text.tertiary, bg: colors.surface.borderLight, defaultLabel: "Unavailable" },
};

export function StatusChip({ status, label }: StatusChipProps) {
  const config = statusConfig[status];

  return (
    <View style={[styles.container, { backgroundColor: config.bg }]}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  label: {
    ...textStyles.caption,
    fontWeight: "600",
  },
});
