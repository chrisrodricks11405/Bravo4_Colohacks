import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { PulseAggregateSnapshot } from "../../types";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

interface PulseBarProps {
  snapshot: PulseAggregateSnapshot | null;
}

type SegmentKey = "gotIt" | "sortOf" | "lost" | "silent";

function formatLastUpdated(value?: string) {
  if (!value) {
    return "Waiting for live responses";
  }

  return `Updated ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))}`;
}

export function PulseBar({ snapshot }: PulseBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const animatedWidths = useRef<Record<SegmentKey, Animated.Value>>({
    gotIt: new Animated.Value(0),
    sortOf: new Animated.Value(0),
    lost: new Animated.Value(0),
    silent: new Animated.Value(0),
  }).current;

  const totals = useMemo(() => {
    const gotItCount = snapshot?.gotItCount ?? 0;
    const sortOfCount = snapshot?.sortOfCount ?? 0;
    const lostCount = snapshot?.lostCount ?? 0;
    const totalActive = snapshot?.totalActive ?? 0;
    const responded = gotItCount + sortOfCount + lostCount;
    const silentCount = Math.max(totalActive - responded, 0);
    const population = Math.max(totalActive, 1);

    return {
      gotItCount,
      sortOfCount,
      lostCount,
      silentCount,
      responded,
      totalActive,
      gotItRatio: gotItCount / population,
      sortOfRatio: sortOfCount / population,
      lostRatio: lostCount / population,
      silentRatio: silentCount / population,
    };
  }, [snapshot]);

  useEffect(() => {
    if (trackWidth <= 0) {
      return;
    }

    const nextWidths = {
      gotIt: trackWidth * totals.gotItRatio,
      sortOf: trackWidth * totals.sortOfRatio,
      lost: trackWidth * totals.lostRatio,
      silent: trackWidth * totals.silentRatio,
    };

    Animated.parallel(
      (Object.keys(nextWidths) as SegmentKey[]).map((key) =>
        Animated.timing(animatedWidths[key], {
          toValue: nextWidths[key],
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        })
      )
    ).start();
  }, [animatedWidths, totals, trackWidth]);

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth !== trackWidth) {
      setTrackWidth(nextWidth);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Pulse Mix</Text>
          <Text style={styles.subtitle}>
            {totals.responded > 0
              ? `${totals.responded} of ${Math.max(totals.totalActive, totals.responded)} active students have a current pulse`
              : "The bar fills as live pulse responses arrive"}
          </Text>
        </View>
        <Text style={styles.updatedAt}>{formatLastUpdated(snapshot?.timestamp)}</Text>
      </View>

      <View style={styles.trackShell}>
        <View style={styles.track} onLayout={handleTrackLayout}>
          <Animated.View
            style={[styles.segment, styles.gotItSegment, { width: animatedWidths.gotIt }]}
          />
          <Animated.View
            style={[styles.segment, styles.sortOfSegment, { width: animatedWidths.sortOf }]}
          />
          <Animated.View
            style={[styles.segment, styles.lostSegment, { width: animatedWidths.lost }]}
          />
          <Animated.View
            style={[styles.segment, styles.silentSegment, { width: animatedWidths.silent }]}
          />
        </View>
      </View>

      <View style={styles.legendRow}>
        <LegendItem
          color={colors.pulse.gotIt}
          label="Got It"
          value={totals.gotItCount}
          percent={totals.gotItRatio}
        />
        <LegendItem
          color={colors.pulse.sortOf}
          label="Sort Of"
          value={totals.sortOfCount}
          percent={totals.sortOfRatio}
        />
        <LegendItem
          color={colors.pulse.lost}
          label="Lost"
          value={totals.lostCount}
          percent={totals.lostRatio}
        />
        <LegendItem
          color={colors.surface.border}
          label="No Pulse"
          value={totals.silentCount}
          percent={totals.silentRatio}
          muted
        />
      </View>
    </View>
  );
}

function LegendItem({
  color,
  label,
  value,
  percent,
  muted = false,
}: {
  color: string;
  label: string;
  value: number;
  percent: number;
  muted?: boolean;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={styles.legendLabelRow}>
        <View style={[styles.legendSwatch, { backgroundColor: color }]} />
        <Text style={[styles.legendLabel, muted && styles.legendLabelMuted]}>{label}</Text>
      </View>
      <Text style={styles.legendValue}>{value}</Text>
      <Text style={styles.legendPercent}>{Math.round(percent * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    flexWrap: "wrap",
  },
  title: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  updatedAt: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
  trackShell: {
    borderRadius: borderRadius["2xl"],
    borderWidth: 1,
    borderColor: colors.surface.borderLight,
    backgroundColor: colors.surface.cardHover,
    padding: spacing.sm,
  },
  track: {
    height: 88,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: colors.surface.borderLight,
  },
  segment: {
    height: "100%",
  },
  gotItSegment: {
    backgroundColor: colors.pulse.gotIt,
  },
  sortOfSegment: {
    backgroundColor: colors.pulse.sortOf,
  },
  lostSegment: {
    backgroundColor: colors.pulse.lost,
  },
  silentSegment: {
    backgroundColor: colors.surface.border,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  legendItem: {
    minWidth: 112,
    flex: 1,
    gap: spacing.xxs,
  },
  legendLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
  },
  legendLabel: {
    ...textStyles.label,
    color: colors.text.secondary,
  },
  legendLabelMuted: {
    color: colors.text.tertiary,
  },
  legendValue: {
    ...textStyles.metricSmall,
    color: colors.text.primary,
  },
  legendPercent: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
});
