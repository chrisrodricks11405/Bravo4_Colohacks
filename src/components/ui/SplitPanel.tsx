import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { spacing, colors } from "../../theme";

interface SplitPanelProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftFlex?: number;
  rightFlex?: number;
  divider?: boolean;
  style?: ViewStyle;
}

export function SplitPanel({
  left,
  right,
  leftFlex = 2,
  rightFlex = 1,
  divider = true,
  style,
}: SplitPanelProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.panel, { flex: leftFlex }]}>{left}</View>
      {divider && <View style={styles.divider} />}
      <View style={[styles.panel, { flex: rightFlex }]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  panel: {
    padding: spacing.base,
  },
  divider: {
    width: 1,
    backgroundColor: colors.surface.border,
  },
});
