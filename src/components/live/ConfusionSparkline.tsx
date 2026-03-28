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
import type {
  ConfusionTrendPoint,
  InterventionActionPayload,
  LessonMarker,
} from "../../types";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

interface ConfusionSparklineProps {
  trend: ConfusionTrendPoint[];
  interventions: InterventionActionPayload[];
  lessonMarkers: LessonMarker[];
  attentionThreshold: number;
}

type InterventionSparklineItem = ConfusionTrendPoint & {
  x: number;
  y: number;
  color: string;
  intervention: InterventionActionPayload;
};

const CHART_HEIGHT = 220;
const CHART_PADDING_X = 18;
const CHART_PADDING_Y = 18;

function formatMarkerLabel(marker: LessonMarker) {
  switch (marker.type) {
    case "new_concept":
      return marker.label || "New concept";
    case "example":
      return marker.label || "Example";
    case "practice":
      return marker.label || "Practice";
    case "review":
      return marker.label || "Review";
    case "question_time":
      return marker.label || "Q&A";
    default:
      return marker.label || "Marker";
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
  const line = buildLinePath(points);
  const bottom = chartHeight - CHART_PADDING_Y;

  return `${line} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
}

function getInterventionMarkerColor(intervention?: InterventionActionPayload) {
  if (!intervention || intervention.confusionAfter == null || intervention.recoveryScore == null) {
    return colors.status.info;
  }

  return intervention.recoveryScore > 0 ? colors.status.success : colors.status.error;
}

function formatInterventionChip(intervention: InterventionActionPayload) {
  const label = intervention.type.replace(/_/g, " ");
  const title = label.replace(/\b\w/g, (character) => character.toUpperCase());

  if (intervention.confusionAfter == null || intervention.recoveryScore == null) {
    return `${title} · measuring`;
  }

  return intervention.recoveryScore > 0
    ? `${title} · -${intervention.recoveryScore.toFixed(1)}`
    : `${title} · +${Math.abs(intervention.recoveryScore).toFixed(1)}`;
}

export function ConfusionSparkline({
  trend,
  interventions,
  lessonMarkers,
  attentionThreshold,
}: ConfusionSparklineProps) {
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
      const x =
        CHART_PADDING_X +
        ((new Date(point.timestamp).getTime() - timelineStart) / span) * chartWidth;
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

    const markerItems = lessonMarkers
      .map((marker) => {
        const markerTime = new Date(marker.timestamp).getTime();
        const x =
          CHART_PADDING_X + ((markerTime - timelineStart) / span) * chartWidth;

        return {
          ...marker,
          x,
        };
      })
      .filter((marker) => marker.x >= CHART_PADDING_X && marker.x <= width - CHART_PADDING_X);

    const interventionMap = new Map(interventions.map((intervention) => [intervention.id, intervention]));
    const interventionItems = svgPoints.reduce<InterventionSparklineItem[]>(
      (items, point) => {
        if (!point.hasInterventionMarker || !point.interventionId) {
          return items;
        }

        const intervention = interventionMap.get(point.interventionId);

        if (!intervention) {
          return items;
        }

        items.push({
          ...point,
          color: getInterventionMarkerColor(intervention),
          intervention,
        });

        return items;
      },
      []
    );

    const thresholdY =
      CHART_HEIGHT -
      CHART_PADDING_Y -
      (Math.max(attentionThreshold, 0) / 100) * drawableHeight;

    return {
      areaPath: buildAreaPath(
        svgPoints.map((point) => ({ x: point.x, y: point.y })),
        CHART_HEIGHT
      ),
      linePath: buildLinePath(svgPoints.map((point) => ({ x: point.x, y: point.y }))),
      interventionItems,
      markerItems,
      points: svgPoints,
      thresholdY,
    };
  }, [attentionThreshold, interventions, lessonMarkers, trend, width]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth !== width) {
      setWidth(nextWidth);
    }
  };

  const recentMarkers = lessonMarkers.slice(-4).reverse();
  const recentInterventions = interventions.slice(-4).reverse();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Confusion Trend</Text>
          <Text style={styles.subtitle}>
            Sparkline updates every few seconds with intervention and lesson markers on the same timeline.
          </Text>
        </View>
        <View style={styles.headerBadges}>
          <LegendDot color={colors.primary[600]} label="Confusion Index" />
          <LegendDot color={colors.status.info} label="Measuring" />
          <LegendDot color={colors.status.success} label="Recovered" />
          <LegendDot color={colors.status.error} label="No drop" />
          <LegendDot color={colors.status.warning} label="Lesson marker" />
        </View>
      </View>

      <View style={styles.chartShell} onLayout={handleLayout}>
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="confusionArea" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={colors.primary[500]} stopOpacity={0.24} />
                <Stop offset="100%" stopColor={colors.primary[500]} stopOpacity={0.04} />
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
              strokeDasharray="8 6"
              opacity={0.9}
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
                  strokeDasharray="3 6"
                  opacity={0.8}
                />
                <Rect
                  x={marker.x - 4}
                  y={CHART_PADDING_Y - 2}
                  width={8}
                  height={8}
                  rx={4}
                  fill={colors.status.warning}
                />
              </React.Fragment>
            ))}

            {prepared.areaPath ? (
              <Path d={prepared.areaPath} fill="url(#confusionArea)" />
            ) : null}

            {prepared.linePath ? (
              <Path
                d={prepared.linePath}
                stroke={colors.primary[600]}
                strokeWidth={4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {prepared.interventionItems.map((item) => (
                <React.Fragment key={`${item.timestamp}-${item.interventionId ?? "marker"}`}>
                  <Line
                    x1={item.x}
                    x2={item.x}
                    y1={CHART_PADDING_Y}
                    y2={CHART_HEIGHT - CHART_PADDING_Y}
                    stroke={item.color}
                    strokeWidth={1}
                    strokeDasharray="4 5"
                    opacity={0.9}
                  />
                  <Circle
                    cx={item.x}
                    cy={item.y}
                    r={6}
                    fill={colors.surface.card}
                    stroke={item.color}
                    strokeWidth={3}
                  />
                </React.Fragment>
              ))}

            {prepared.points.length > 0 ? (
              <Circle
                cx={prepared.points[prepared.points.length - 1].x}
                cy={prepared.points[prepared.points.length - 1].y}
                r={5}
                fill={colors.primary[700]}
              />
            ) : null}
          </Svg>
        ) : null}
      </View>

      <View style={styles.markerStrip}>
        {recentMarkers.length > 0 ? (
          recentMarkers.map((marker) => (
            <View key={marker.id} style={styles.markerChip}>
              <View style={styles.markerChipDot} />
              <Text style={styles.markerChipText}>{formatMarkerLabel(marker)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>
            Lesson markers will appear here after you tag a new concept, example, or practice segment.
          </Text>
        )}
      </View>

      <View style={styles.markerStrip}>
        {recentInterventions.length > 0 ? (
          recentInterventions.map((intervention) => (
            <View
              key={intervention.id}
              style={[
                styles.interventionChip,
                {
                  backgroundColor:
                    intervention.confusionAfter == null || intervention.recoveryScore == null
                      ? colors.status.infoBg
                      : intervention.recoveryScore > 0
                        ? colors.status.successBg
                        : colors.status.errorBg,
                },
              ]}
            >
              <View
                style={[
                  styles.interventionChipDot,
                  { backgroundColor: getInterventionMarkerColor(intervention) },
                ]}
              />
              <Text style={styles.interventionChipText}>
                {formatInterventionChip(intervention)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>
            Intervention results will appear here once you log a classroom action.
          </Text>
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
  headerBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
  },
  legendText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  chartShell: {
    minHeight: CHART_HEIGHT,
    borderRadius: borderRadius["2xl"],
    borderWidth: 1,
    borderColor: colors.surface.borderLight,
    backgroundColor: colors.surface.cardHover,
    overflow: "hidden",
  },
  markerStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  markerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.status.warningBg,
  },
  markerChipDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.status.warning,
  },
  markerChipText: {
    ...textStyles.bodySmall,
    color: "#92400E",
    fontWeight: "600",
  },
  interventionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  interventionChipDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  interventionChipText: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: "600",
  },
  emptyText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
});
