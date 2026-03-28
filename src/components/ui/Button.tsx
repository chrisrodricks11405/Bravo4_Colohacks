import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
  Insets,
} from "react-native";
import { colors, spacing, borderRadius, textStyles } from "../../theme";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "dark";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityHint?: string;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  style,
  textStyle,
  accessibilityHint,
  accessibilityLabel,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={styles.hitSlop}
      style={[
        styles.base,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === "primary" || variant === "danger" || variant === "dark"
              ? colors.text.inverse
              : colors.primary[600]
          }
        />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === "left" && (
            <View style={styles.iconLeft}>{icon}</View>
          )}
          <Text
            style={[
              styles.textBase,
              variantTextStyles[variant],
              sizeTextStyles[size],
              isDisabled && styles.textDisabled,
              textStyle,
            ]}
          >
            {title}
          </Text>
          {icon && iconPosition === "right" && (
            <View style={styles.iconRight}>{icon}</View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.lg,
    borderWidth: 0,
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.45,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
  textBase: {
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  textDisabled: {
    opacity: 0.7,
  },
  hitSlop: {
    top: 6,
    right: 6,
    bottom: 6,
    left: 6,
  } satisfies Insets,
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: colors.primary[600],
  },
  secondary: {
    backgroundColor: colors.primary[50],
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.surface.border,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: colors.status.error,
  },
  dark: {
    backgroundColor: colors.dark.surface,
  },
};

const variantTextStyles: Record<ButtonVariant, TextStyle> = {
  primary: { color: colors.text.inverse },
  secondary: { color: colors.primary[700] },
  outline: { color: colors.text.primary },
  ghost: { color: colors.primary[600] },
  danger: { color: colors.text.inverse },
  dark: { color: colors.text.inverse },
};

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { paddingHorizontal: spacing.base, paddingVertical: spacing.sm + 2, minHeight: 40 },
  md: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, minHeight: 48 },
  lg: { paddingHorizontal: spacing["2xl"], paddingVertical: spacing.base, minHeight: 52 },
};

const sizeTextStyles: Record<ButtonSize, TextStyle> = {
  sm: { fontSize: textStyles.bodySmall.fontSize },
  md: { fontSize: textStyles.bodyMedium.fontSize },
  lg: { fontSize: textStyles.bodyLarge.fontSize },
};
