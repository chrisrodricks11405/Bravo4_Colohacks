import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { spacing } from "../../theme";

interface SplitPanelProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftFlex?: number;
  rightFlex?: number;
  divider?: boolean;
  gap?: number;
  style?: ViewStyle;
}

export function SplitPanel({
  left,
  right,
  leftFlex = 2,
  rightFlex = 1,
  divider = false,
  gap = spacing.xl,
  style,
}: SplitPanelProps) {
  return (
    <View style={[styles.container, { gap }, style]}>
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
  panel: {},
  divider: {
    width: 1,
    backgroundColor: "rgba(199, 196, 215, 0.15)",
  },
});
