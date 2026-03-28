import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Button } from "../ui";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

type InsightTone = "info" | "warning" | "action" | "neutral";

interface InsightAction {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
}

interface AIInsightStripProps {
  title: string;
  message: string;
  tone?: InsightTone;
  chipLabel?: string;
  primaryAction?: InsightAction;
  secondaryAction?: InsightAction;
}

const toneStyles: Record<
  InsightTone,
  {
    backgroundColor: string;
    borderColor: string;
    accentColor: string;
    badgeVariant: "info" | "warning" | "primary" | "neutral";
  }
> = {
  info: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    accentColor: "#2563EB",
    badgeVariant: "info",
  },
  warning: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    accentColor: "#EA580C",
    badgeVariant: "warning",
  },
  action: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    accentColor: "#0F766E",
    badgeVariant: "primary",
  },
  neutral: {
    backgroundColor: colors.surface.card,
    borderColor: colors.surface.border,
    accentColor: colors.text.secondary,
    badgeVariant: "neutral",
  },
};

export function AIInsightStrip({
  title,
  message,
  tone = "info",
  chipLabel = "AI Insight",
  primaryAction,
  secondaryAction,
}: AIInsightStripProps) {
  const toneStyle = toneStyles[tone];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
      ]}
    >
      <View
        style={[styles.accentBar, { backgroundColor: toneStyle.accentColor }]}
      />

      <View style={styles.content}>
        <View style={styles.copy}>
          <Badge label={chipLabel} variant={toneStyle.badgeVariant} size="sm" />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>

        <View style={styles.actions}>
          {secondaryAction ? (
            <Button
              title={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant={secondaryAction.variant ?? "ghost"}
              size="sm"
              style={styles.actionButton}
            />
          ) : null}
          {primaryAction ? (
            <Button
              title={primaryAction.label}
              onPress={primaryAction.onPress}
              variant={primaryAction.variant ?? "primary"}
              size="sm"
              style={styles.actionButton}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
  },
  accentBar: {
    width: 6,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    flexWrap: "wrap",
  },
  copy: {
    flex: 1,
    minWidth: 260,
    gap: spacing.xs,
  },
  title: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  message: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    alignItems: "center",
  },
  actionButton: {
    minWidth: 124,
  },
});
