import React from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { colors, spacing, borderRadius, textStyles } from "../../theme";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral" | "primary";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  dot?: boolean;
  style?: ViewStyle;
}

export function Badge({
  label,
  variant = "neutral",
  size = "sm",
  dot = false,
  style,
}: BadgeProps) {
  return (
    <View style={[styles.base, badgeVariants[variant], sizeStyles[size], style]}>
      {dot && <View style={[styles.dot, dotVariants[variant]]} />}
      <Text style={[styles.text, textVariants[variant], size === "sm" && styles.textSm]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  text: {
    fontWeight: "600",
  },
  textSm: {
    ...textStyles.caption,
    fontWeight: "600",
  },
});

const badgeVariants: Record<BadgeVariant, ViewStyle> = {
  success: { backgroundColor: colors.status.successBg },
  warning: { backgroundColor: colors.status.warningBg },
  error: { backgroundColor: colors.status.errorBg },
  info: { backgroundColor: colors.status.infoBg },
  neutral: { backgroundColor: colors.surface.borderLight },
  primary: { backgroundColor: colors.primary[50] },
};

const textVariants: Record<BadgeVariant, TextStyle> = {
  success: { color: "#065F46" },
  warning: { color: "#92400E" },
  error: { color: "#991B1B" },
  info: { color: "#1E40AF" },
  neutral: { color: colors.text.secondary },
  primary: { color: colors.primary[700] },
};

const dotVariants: Record<BadgeVariant, ViewStyle> = {
  success: { backgroundColor: colors.status.success },
  warning: { backgroundColor: colors.status.warning },
  error: { backgroundColor: colors.status.error },
  info: { backgroundColor: colors.status.info },
  neutral: { backgroundColor: colors.text.tertiary },
  primary: { backgroundColor: colors.primary[500] },
};

const sizeStyles: Record<string, ViewStyle> = {
  sm: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  md: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
};
