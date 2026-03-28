export const colors = {
  // Primary brand
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

  // Pulse signal colors
  pulse: {
    gotIt: "#10B981",
    gotItBg: "#D1FAE5",
    sortOf: "#F59E0B",
    sortOfBg: "#FEF3C7",
    lost: "#EF4444",
    lostBg: "#FEE2E2",
  },

  // Neutral / Surface
  surface: {
    background: "#F8FAFC",
    card: "#FFFFFF",
    cardHover: "#F1F5F9",
    border: "#E2E8F0",
    borderLight: "#F1F5F9",
    overlay: "rgba(15, 23, 42, 0.5)",
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

  // Dark surface (for header bars, dark panels)
  dark: {
    background: "#1A1B2E",
    surface: "#232442",
    surfaceLight: "#2D2F52",
    text: "#E2E8F0",
    textSecondary: "#94A3B8",
  },
} as const;

export type Colors = typeof colors;
