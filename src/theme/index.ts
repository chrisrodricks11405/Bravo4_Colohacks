export { colors } from "./colors";
export type { Colors } from "./colors";
export { fontSize, lineHeight, textStyles, fontFamily } from "./typography";
export { spacing, borderRadius, iconSize } from "./spacing";

/**
 * Tinted ambient shadows — use `on-surface` tinted at low opacity
 * instead of pure black, per DESIGN.md "Lucid Mentor" spec.
 */
export const shadows = {
  /** Subtle lift for nested cards */
  sm: {
    shadowColor: "#191C1E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  /** Standard card elevation */
  md: {
    shadowColor: "#191C1E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  /** Hero / floating elements */
  lg: {
    shadowColor: "#191C1E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 5,
  },
  /** Extra large — modals & overlays */
  xl: {
    shadowColor: "#191C1E",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 8,
  },
} as const;
