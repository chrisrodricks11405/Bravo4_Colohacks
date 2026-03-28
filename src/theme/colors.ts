export const colors = {
  // Primary brand — Indigo authority
  primary: {
    50: "#EEF2FF",
    100: "#E0E7FF",
    200: "#C7D2FE",
    300: "#A5B4FC",
    400: "#818CF8",
    500: "#6366F1",
    600: "#4F46E5",
    700: "#4338CA",
    800: "#3730A3",
    900: "#312E81",
  },

  // Pulse signal colors — student response states
  pulse: {
    gotIt: "#10B981",
    gotItBg: "#D1FAE5",
    sortOf: "#F59E0B",
    sortOfBg: "#FEF3C7",
    lost: "#EF4444",
    lostBg: "#FEE2E2",
  },

  // Surface hierarchy (tonal layering from DESIGN.md)
  surface: {
    background: "#F7F9FB", // Base layer
    backgroundAlt: "#F2F4F6", // surface-container-low — sidebar / secondary
    card: "#FFFFFF", // surface-container-lowest — "lifted" cards
    cardHover: "#F1F5F9",
    cardMuted: "#F8FAFC", // Subtle fill for nested containers
    border: "#E2E8F0",
    borderLight: "#F1F5F9",
    borderGhost: "rgba(199, 196, 215, 0.15)", // Ghost border — felt, not seen
    overlay: "rgba(15, 23, 42, 0.5)",
    elevated: "#E6E8EA", // surface-container-high — interactive overlays
  },

  // Text
  text: {
    primary: "#0F172A",
    secondary: "#475569",
    tertiary: "#94A3B8",
    inverse: "#FFFFFF",
    link: "#4F46E5",
  },

  // Status
  status: {
    success: "#10B981",
    successBg: "#D1FAE5",
    warning: "#F59E0B",
    warningBg: "#FEF3C7",
    error: "#EF4444",
    errorBg: "#FEE2E2",
    info: "#3B82F6",
    infoBg: "#DBEAFE",
  },

  // Dark surface (for header bars, dark panels, glass overlays)
  dark: {
    background: "#1A1B2E",
    surface: "#232442",
    surfaceLight: "#2D2F52",
    surfaceGlass: "rgba(35, 36, 66, 0.90)", // Glass panel — 90% opacity
    text: "#E2E8F0",
    textSecondary: "#94A3B8",
    textMuted: "rgba(255, 255, 255, 0.6)",
  },

  // Accent — secondary highlights (from DESIGN.md)
  accent: {
    mint: "#6CF8BB",
    mintBg: "rgba(108, 248, 187, 0.12)",
    coral: "#FF6B6B",
    coralBg: "rgba(255, 107, 107, 0.12)",
  },

  // Glassmorphism tokens
  glass: {
    light: "rgba(255, 255, 255, 0.70)",
    lightBorder: "rgba(255, 255, 255, 0.20)",
    dark: "rgba(26, 27, 46, 0.85)",
    darkBorder: "rgba(255, 255, 255, 0.08)",
    frosted: "rgba(248, 250, 252, 0.80)",
  },
} as const;

export type Colors = typeof colors;
