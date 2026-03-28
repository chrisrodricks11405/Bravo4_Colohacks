import { TextStyle } from "react-native";

export const fontFamily = {
  regular: "System",
  medium: "System",
  semibold: "System",
  bold: "System",
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  "2xl": 30,
  "3xl": 36,
  "4xl": 48,
} as const;

export const lineHeight = {
  xs: 16,
  sm: 18,
  base: 22,
  md: 24,
  lg: 28,
  xl: 32,
  "2xl": 38,
  "3xl": 44,
  "4xl": 56,
} as const;

export const textStyles = {
  displayLarge: {
    fontSize: fontSize["4xl"],
    lineHeight: lineHeight["4xl"],
    fontWeight: "700",
  } satisfies TextStyle,

  displayMedium: {
    fontSize: fontSize["3xl"],
    lineHeight: lineHeight["3xl"],
    fontWeight: "700",
  } satisfies TextStyle,

  headingLarge: {
    fontSize: fontSize["2xl"],
    lineHeight: lineHeight["2xl"],
    fontWeight: "600",
  } satisfies TextStyle,

  headingMedium: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: "600",
  } satisfies TextStyle,

  headingSmall: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: "600",
  } satisfies TextStyle,

  bodyLarge: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: "400",
  } satisfies TextStyle,

  bodyMedium: {
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    fontWeight: "400",
  } satisfies TextStyle,

  bodySmall: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "400",
  } satisfies TextStyle,

  caption: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: "400",
  } satisfies TextStyle,

  label: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  } satisfies TextStyle,

  /** Large metric numbers on dashboard */
  metric: {
    fontSize: fontSize["4xl"],
    lineHeight: lineHeight["4xl"],
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,

  metricSmall: {
    fontSize: fontSize["2xl"],
    lineHeight: lineHeight["2xl"],
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,
} as const;
