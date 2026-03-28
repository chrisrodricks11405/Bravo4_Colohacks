import React from "react";
import { TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing, borderRadius } from "../../theme";

interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  variant?: "default" | "primary" | "ghost" | "tonal";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
  accessibilityLabel: string;
}

export function IconButton({
  icon,
  onPress,
  variant = "default",
  size = "md",
  disabled = false,
  style,
  accessibilityHint,
  accessibilityLabel,
}: IconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={[
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.lg,
  },
  disabled: {
    opacity: 0.35,
  },
});

const variantStyles: Record<string, ViewStyle> = {
  default: {
    backgroundColor: colors.surface.backgroundAlt,
  },
  primary: {
    backgroundColor: colors.primary[50],
  },
  ghost: {
    backgroundColor: "transparent",
  },
  tonal: {
    backgroundColor: colors.surface.cardMuted,
  },
};

const sizeStyles: Record<string, ViewStyle> = {
  sm: { width: 40, height: 40 },
  md: { width: 48, height: 48 },
  lg: { width: 56, height: 56 },
};
