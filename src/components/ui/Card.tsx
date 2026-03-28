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
  variant?: "default" | "elevated" | "outlined" | "glass" | "dark" | "tonal";
  padding?: "none" | "sm" | "md" | "lg" | "xl";
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
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
});

const variantStyles: Record<string, ViewStyle> = {
  default: {
    backgroundColor: colors.surface.card,
    ...shadows.sm,
  },
  elevated: {
    backgroundColor: colors.surface.card,
    ...shadows.lg,
  },
  outlined: {
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.borderGhost,
  },
  glass: {
    backgroundColor: colors.glass.frosted,
    ...shadows.md,
  },
  dark: {
    backgroundColor: colors.dark.background,
    ...shadows.lg,
  },
  tonal: {
    backgroundColor: colors.surface.backgroundAlt,
  },
};

const paddingStyles: Record<string, ViewStyle> = {
  none: {},
  sm: { padding: spacing.md },
  md: { padding: spacing.lg },
  lg: { padding: spacing.xl },
  xl: { padding: spacing["2xl"] },
};
