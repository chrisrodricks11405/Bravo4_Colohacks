import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, textStyles } from "../../theme";

interface StateScreenProps {
  title: string;
  message?: string;
  loading?: boolean;
  tone?: "light" | "dark";
}

export function StateScreen({
  title,
  message,
  loading = false,
  tone = "light",
}: StateScreenProps) {
  const isDark = tone === "dark";

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.dark.background : colors.surface.background },
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={isDark ? colors.text.inverse : colors.primary[600]}
            style={styles.spinner}
            accessibilityLabel="Loading"
          />
        ) : null}
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: isDark ? colors.text.inverse : colors.text.primary }]}
        >
          {title}
        </Text>
        {message ? (
          <Text
            style={[
              styles.message,
              { color: isDark ? colors.dark.textSecondary : colors.text.secondary },
            ]}
          >
            {message}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  spinner: {
    marginBottom: spacing.lg,
  },
  title: {
    ...textStyles.headingLarge,
    textAlign: "center",
  },
  message: {
    ...textStyles.bodyMedium,
    marginTop: spacing.sm,
    maxWidth: 420,
    textAlign: "center",
  },
});
