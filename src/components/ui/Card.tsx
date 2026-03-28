import React from "react";
import {
  View,
  StyleSheet,
  StyleProp,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { colors, spacing, borderRadius, shadows } from "../../theme";

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: "default" | "elevated" | "outlined";
  padding?: "none" | "sm" | "md" | "lg";
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  variant = "default",
  padding = "md",
  style,
}: CardProps) {
  const cardStyle = [
    styles.base,
    variantStyles[variant],
    paddingStyles[padding],
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={cardStyle}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
});

const variantStyles: Record<string, ViewStyle> = {
  default: {
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.surface.borderLight,
  },
  elevated: {
    ...shadows.lg,
  },
  outlined: {
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
};

const paddingStyles: Record<string, ViewStyle> = {
  none: {},
  sm: { padding: spacing.md },
  md: { padding: spacing.base },
  lg: { padding: spacing.xl },
};
