import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import type { ConfusionTrendPoint, LessonMarker, PeakMoment } from "../../types";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

interface SessionSummaryTimelineProps {
  trend: ConfusionTrendPoint[];
  lessonMarkers: LessonMarker[];
  peaks: PeakMoment[];
  attentionThreshold: number;
}

const CHART_HEIGHT = 220;
const CHART_PADDING_X = 18;
const CHART_PADDING_Y = 18;

function formatMarkerType(type: LessonMarker["type"]) {
  switch (type) {
    case "new_concept":
      return "New concept";
    case "example":
      return "Example";
    case "practice":
      return "Practice";
    case "review":
      return "Review";
    case "question_time":
      return "Q&A";
    default:
      return "Marker";
  }
}

function buildLinePath(points: { x: number; y: number }[]) {
  return points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    )
    .join(" ");
}

function buildAreaPath(points: { x: number; y: number }[], chartHeight: number) {
  if (points.length === 0) {
    return "";
  }

  const first = points[0];
  const last = points[points.length - 1];
  const bottom = chartHeight - CHART_PADDING_Y;

  return `${buildLinePath(points)} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
}

export function SessionSummaryTimeline({
  trend,
  lessonMarkers,
  peaks,
  attentionThreshold,
}: SessionSummaryTimelineProps) {
  const [width, setWidth] = useState(0);

  const prepared = useMemo(() => {
    const points =
      trend.length > 0
        ? trend
        : [
            {
              timestamp: new Date(Date.now() - 60_000).toISOString(),
              confusionIndex: 0,
              lostPercent: 0,
              hasInterventionMarker: false,
            },
            {
              timestamp: new Date().toISOString(),
              confusionIndex: 0,
              lostPercent: 0,
              hasInterventionMarker: false,
            },
          ];

    const timelineStart = new Date(points[0].timestamp).getTime();
    const timelineEnd = new Date(points[points.length - 1].timestamp).getTime();
    const span = Math.max(timelineEnd - timelineStart, 1);
    const chartWidth = Math.max(width - CHART_PADDING_X * 2, 1);
    const drawableHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;

    const svgPoints = points.map((point) => {
      const pointMs = new Date(point.timestamp).getTime();
      const x = CHART_PADDING_X + ((pointMs - timelineStart) / span) * chartWidth;
      const y =
        CHART_HEIGHT -
        CHART_PADDING_Y -
        (Math.max(point.confusionIndex, 0) / 100) * drawableHeight;

      return {
        ...point,
        x,
        y,
      };
    });

    const thresholdY =
      CHART_HEIGHT -
      CHART_PADDING_Y -
      (Math.max(attentionThreshold, 0) / 100) * drawableHeight;

    const markerItems = lessonMarkers
      .map((marker) => {
        const markerMs = new Date(marker.timestamp).getTime();
        const x = CHART_PADDING_X + ((markerMs - timelineStart) / span) * chartWidth;

        return {
          ...marker,
          x,
        };
      })
      .filter((marker) => marker.x >= CHART_PADDING_X && marker.x <= width - CHART_PADDING_X);

    const peakItems = peaks
      .map((peak) => {
        const peakMs = new Date(peak.timestamp).getTime();
        const x = CHART_PADDING_X + ((peakMs - timelineStart) / span) * chartWidth;
        const y =
          CHART_HEIGHT -
          CHART_PADDING_Y -
          (Math.max(peak.confusionIndex, 0) / 100) * drawableHeight;

        return {
          ...peak,
          x,
          y,
        };
      })
      .filter((peak) => peak.x >= CHART_PADDING_X && peak.x <= width - CHART_PADDING_X);

    const interventionItems = svgPoints.filter((point) => point.hasInterventionMarker);

    return {
      areaPath: buildAreaPath(
        svgPoints.map((point) => ({ x: point.x, y: point.y })),
        CHART_HEIGHT
      ),
      linePath: buildLinePath(svgPoints.map((point) => ({ x: point.x, y: point.y }))),
      markerItems,
      peakItems,
      interventionItems,
      thresholdY,
    };
  }, [attentionThreshold, lessonMarkers, peaks, trend, width]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth !== width) {
      setWidth(nextWidth);
    }
  };

  const recentMarkers = lessonMarkers.slice(-4).reverse();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Comprehension Timeline</Text>
          <Text style={styles.subtitle}>
            Full session sparkline with lesson markers, intervention touches, and highlighted peak confusion moments.
          </Text>
        </View>
        <View style={styles.legend}>
          <LegendDot color={colors.primary[600]} label="Trend" />
          <LegendDot color={colors.status.warning} label="Marker" />
          <LegendDot color={colors.text.secondary} label="Intervention" />
          <LegendDot color={colors.status.error} label="Peak" />
        </View>
      </View>

      <View style={styles.chartShell} onLayout={handleLayout}>
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="summaryTimelineArea" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={colors.primary[500]} stopOpacity={0.28} />
                <Stop offset="100%" stopColor={colors.primary[500]} stopOpacity={0.03} />
              </LinearGradient>
            </Defs>

            {[25, 50, 75].map((value) => {
              const y =
                CHART_HEIGHT -
                CHART_PADDING_Y -
                (value / 100) * (CHART_HEIGHT - CHART_PADDING_Y * 2);

              return (
                <Line
                  key={value}
                  x1={CHART_PADDING_X}
                  x2={width - CHART_PADDING_X}
                  y1={y}
                  y2={y}
                  stroke={colors.surface.border}
                  strokeWidth={1}
                  strokeDasharray="4 6"
                />
              );
            })}

            <Line
              x1={CHART_PADDING_X}
              x2={width - CHART_PADDING_X}
              y1={prepared.thresholdY}
              y2={prepared.thresholdY}
              stroke={colors.status.warning}
              strokeWidth={1.5}
              strokeDasharray="6 6"
            />

            {prepared.markerItems.map((marker) => (
              <React.Fragment key={marker.id}>
                <Line
                  x1={marker.x}
                  x2={marker.x}
                  y1={CHART_PADDING_Y}
                  y2={CHART_HEIGHT - CHART_PADDING_Y}
                  stroke={colors.status.warning}
                  strokeWidth={1}
                  strokeDasharray="3 5"
                />
                <Rect
                  x={marker.x - 3}
                  y={CHART_PADDING_Y + 8}
                  width={6}
                  height={6}
                  rx={3}
                  fill={colors.status.warning}
                />
              </React.Fragment>
            ))}

            {prepared.areaPath ? (
              <Path d={prepared.areaPath} fill="url(#summaryTimelineArea)" />
            ) : null}

            {prepared.linePath ? (
              <Path
                d={prepared.linePath}
                fill="none"
                stroke={colors.primary[600]}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {prepared.interventionItems.map((point, index) => (
              <Circle
                key={`${point.timestamp}-${index}`}
                cx={point.x}
                cy={point.y}
                r={4}
                fill={colors.text.secondary}
                stroke={colors.surface.card}
                strokeWidth={2}
              />
            ))}

            {prepared.peakItems.map((peak) => (
              <React.Fragment key={peak.timestamp}>
                <Circle
                  cx={peak.x}
                  cy={peak.y}
                  r={7}
                  fill={colors.status.errorBg}
                  stroke={colors.status.error}
                  strokeWidth={2}
                />
                <Circle cx={peak.x} cy={peak.y} r={2.5} fill={colors.status.error} />
              </React.Fragment>
            ))}
          </Svg>
        ) : null}
      </View>

      <View style={styles.footer}>
        {recentMarkers.length === 0 ? (
          <Text style={styles.emptyText}>No lesson markers were added during this session.</Text>
        ) : (
          recentMarkers.map((marker) => (
            <View key={marker.id} style={styles.markerChip}>
              <View style={styles.markerDot} />
              <Text style={styles.markerChipText}>
                {marker.label ?? formatMarkerType(marker.type)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.base,
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
    maxWidth: 640,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    alignItems: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...textStyles.caption,
    color: colors.text.secondary,
  },
  chartShell: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.card,
    overflow: "hidden",
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  markerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.cardHover,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  markerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.status.warning,
  },
  markerChipText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  emptyText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
});
