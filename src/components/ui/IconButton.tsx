import React from "react";
import { TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing, borderRadius } from "../../theme";

interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  variant?: "default" | "primary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  style?: ViewStyle;
}

export function IconButton({
  icon,
  onPress,
  variant = "default",
  size = "md",
  disabled = false,
  style,
}: IconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
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
    opacity: 0.4,
  },
});

const variantStyles: Record<string, ViewStyle> = {
  default: {
    backgroundColor: colors.surface.cardHover,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  primary: {
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  ghost: {
    backgroundColor: "transparent",
  },
};

const sizeStyles: Record<string, ViewStyle> = {
  sm: { width: 32, height: 32 },
  md: { width: 40, height: 40 },
  lg: { width: 48, height: 48 },
};
