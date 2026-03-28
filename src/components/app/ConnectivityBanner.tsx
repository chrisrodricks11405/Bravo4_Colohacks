import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStore } from "../../stores";
import { borderRadius, colors, shadows, spacing, textStyles } from "../../theme";

function getModeLabel(mode: "online" | "offline" | "local_hotspot") {
  switch (mode) {
    case "local_hotspot":
      return "Local hotspot";
    case "offline":
      return "Offline";
    default:
      return "Online";
  }
}

export function ConnectivityBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    mode,
    pendingSyncCount,
    failedSyncCount,
    syncInProgress,
    syncProgress,
  } = useNetworkStore();

  const shouldShow =
    syncInProgress || mode !== "online" || pendingSyncCount > 0 || failedSyncCount > 0;

  if (!shouldShow) {
    return null;
  }

  const tone =
    failedSyncCount > 0
      ? styles.bannerError
      : mode === "online" && !syncInProgress
        ? styles.bannerNeutral
        : styles.bannerWarning;

  const statusLabel = syncInProgress
    ? `Syncing ${syncProgress}%`
    : getModeLabel(mode);

  const detailLabel =
    failedSyncCount > 0
      ? `${failedSyncCount} failed`
      : pendingSyncCount > 0
        ? `${pendingSyncCount} queued`
        : "Tap for sync";

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          top: Math.max(insets.top, spacing.base),
        },
      ]}
    >
      <Pressable
        onPress={() => router.push("/(tabs)/sync")}
        style={[styles.banner, tone]}
      >
        <Text style={styles.label}>{statusLabel}</Text>
        <Text style={styles.detail}>{detailLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: spacing.base,
    zIndex: 60,
  },
  banner: {
    minWidth: 138,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    ...shadows.md,
  },
  bannerNeutral: {
    backgroundColor: colors.surface.card,
    borderColor: colors.surface.border,
  },
  bannerWarning: {
    backgroundColor: colors.status.warningBg,
    borderColor: "rgba(146, 64, 14, 0.18)",
  },
  bannerError: {
    backgroundColor: colors.status.errorBg,
    borderColor: "rgba(153, 27, 27, 0.18)",
  },
  label: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: "700",
  },
  detail: {
    ...textStyles.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
});
