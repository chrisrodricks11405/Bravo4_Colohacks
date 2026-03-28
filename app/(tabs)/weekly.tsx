import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, Card } from "../../src/components/ui";
import { useWeeklyInsights } from "../../src/hooks/useWeeklyInsights";
import { isValidDateKey, resolveWeeklyDateRange } from "../../src/services";
import type {
  WeeklyHeatmapCell,
  WeeklyInterventionTrend,
  WeeklyRangePreset,
  WeeklyRecurringMisconception,
  WeeklySubjectComprehension,
  WeeklyTopicDifficultyCell,
} from "../../src/types";
import {
  borderRadius,
  colors,
  spacing,
  textStyles,
} from "../../src/theme";

function formatGeneratedAt(value: string | null) {
  if (!value) {
    return "No cached report yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatInterventionType(type: WeeklyInterventionTrend["type"]) {
  switch (type) {
    case "language_switch":
      return "Language switch";
    case "board_script":
      return "Board script";
    case "bilingual_explanation":
      return "Bilingual explanation";
    default:
      return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

function formatReasonChip(chip: WeeklyRecurringMisconception["dominantReasonChip"]) {
  switch (chip) {
    case "step_unclear":
      return "Steps unclear";
    case "language_friction":
      return "Language friction";
    case "missing_prerequisite":
      return "Missing prerequisite";
    case "too_fast":
      return "Too fast";
    case "notation_confusion":
      return "Notation confusion";
    case "example_needed":
      return "Example needed";
    default:
      return "Other";
  }
}

function getRiskTone(score: number, hasData = true) {
  if (!hasData) {
    return {
      backgroundColor: colors.surface.borderLight,
      borderColor: colors.surface.border,
      textColor: colors.text.tertiary,
    };
  }

  if (score >= 70) {
    return {
      backgroundColor: colors.status.errorBg,
      borderColor: "#FECACA",
      textColor: "#991B1B",
    };
  }

  if (score >= 50) {
    return {
      backgroundColor: colors.status.warningBg,
      borderColor: "#FCD34D",
      textColor: "#92400E",
    };
  }

  if (score >= 30) {
    return {
      backgroundColor: colors.status.infoBg,
      borderColor: "#93C5FD",
      textColor: "#1D4ED8",
    };
  }

  return {
    backgroundColor: colors.status.successBg,
    borderColor: "#86EFAC",
    textColor: "#065F46",
  };
}

function getComprehensionTone(score: number) {
  if (score >= 80) {
    return colors.status.success;
  }

  if (score >= 60) {
    return colors.status.info;
  }

  if (score >= 40) {
    return colors.status.warning;
  }

  return colors.status.error;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card variant="default" padding="lg" style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricHint}>{hint}</Text>
    </Card>
  );
}

function RangeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.rangeButton, active && styles.rangeButtonActive]}
    >
      <Text style={[styles.rangeButtonText, active && styles.rangeButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function TopicDifficultyCell({ cell }: { cell: WeeklyTopicDifficultyCell }) {
  const tone = getRiskTone(cell.avgDifficultyScore, cell.sessionCount > 0);

  return (
    <View
      style={[
        styles.topicCell,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <Text style={[styles.topicCellSubject, { color: tone.textColor }]}>
        {cell.subject}
      </Text>
      <Text style={[styles.topicCellTopic, { color: tone.textColor }]}>
        {cell.topic}
      </Text>
      <View style={styles.topicCellFooter}>
        <Text style={[styles.topicCellMeta, { color: tone.textColor }]}>
          Difficulty {cell.avgDifficultyScore.toFixed(0)}
        </Text>
        <Text style={[styles.topicCellMeta, { color: tone.textColor }]}>
          {cell.sessionCount} sess
        </Text>
      </View>
    </View>
  );
}

function HeatmapCellView({ cell }: { cell: WeeklyHeatmapCell }) {
  const tone = getRiskTone(cell.avgConfusionIndex, cell.sessionCount > 0);

  return (
    <View
      style={[
        styles.heatmapCell,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <Text style={[styles.heatmapValue, { color: tone.textColor }]}>
        {cell.sessionCount > 0 ? cell.avgConfusionIndex.toFixed(0) : "—"}
      </Text>
      <Text style={[styles.heatmapMeta, { color: tone.textColor }]}>
        {cell.sessionCount > 0 ? `${cell.sessionCount}x` : "No data"}
      </Text>
    </View>
  );
}

function InterventionTrendRow({
  trend,
  maxRecoveryScore,
}: {
  trend: WeeklyInterventionTrend;
  maxRecoveryScore: number;
}) {
  const progress = maxRecoveryScore > 0 ? (trend.avgRecoveryScore / maxRecoveryScore) * 100 : 0;
  const trendBadgeVariant =
    trend.trendDirection === "up"
      ? "success"
      : trend.trendDirection === "down"
        ? "error"
        : "neutral";
  const trendLabel =
    trend.trendDirection === "up"
      ? `Rising ${trend.trendDelta.toFixed(0)}`
      : trend.trendDirection === "down"
        ? `Falling ${Math.abs(trend.trendDelta).toFixed(0)}`
        : "Stable";

  return (
    <View style={styles.interventionRow}>
      <View style={styles.interventionRowTop}>
        <View style={styles.interventionRowCopy}>
          <Text style={styles.interventionName}>{formatInterventionType(trend.type)}</Text>
          <Text style={styles.interventionMeta}>
            {trend.usageCount} uses · {trend.successfulCount} with measured recovery
          </Text>
        </View>
        <Badge label={trendLabel} variant={trendBadgeVariant} />
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.max(progress, trend.usageCount > 0 ? 8 : 0)}%`,
              backgroundColor: getComprehensionTone(trend.avgRecoveryScore),
            },
          ]}
        />
      </View>
      <Text style={styles.interventionRecovery}>
        Avg recovery {trend.avgRecoveryScore.toFixed(1)}
      </Text>
    </View>
  );
}

function SubjectComprehensionRow({
  item,
  maxScore,
}: {
  item: WeeklySubjectComprehension;
  maxScore: number;
}) {
  const widthPercent = maxScore > 0 ? (item.avgComprehensionScore / maxScore) * 100 : 0;

  return (
    <View style={styles.subjectRow}>
      <View style={styles.subjectRowHeader}>
        <Text style={styles.subjectName}>{item.subject}</Text>
        <Text style={styles.subjectMeta}>
          {item.avgComprehensionScore.toFixed(0)} comprehension · {item.sessionCount} sessions
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.max(widthPercent, item.sessionCount > 0 ? 8 : 0)}%`,
              backgroundColor: getComprehensionTone(item.avgComprehensionScore),
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function WeeklyScreen() {
  const defaultCustomRange = useMemo(() => resolveWeeklyDateRange("this_week"), []);
  const [preset, setPreset] = useState<WeeklyRangePreset>("this_week");
  const [customStartDate, setCustomStartDate] = useState(defaultCustomRange.startDate);
  const [customEndDate, setCustomEndDate] = useState(defaultCustomRange.endDate);
  const [appliedCustomRange, setAppliedCustomRange] = useState({
    startDate: defaultCustomRange.startDate,
    endDate: defaultCustomRange.endDate,
  });
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);

  const {
    insight,
    range,
    isLoading,
    isRefreshing,
    isSyncing,
    lastGeneratedAt,
    syncError,
    refresh,
  } = useWeeklyInsights({
    preset,
    customRange: appliedCustomRange,
    autoSync: true,
  });

  const topicGroups = useMemo(() => {
    const groups = new Map<string, WeeklyTopicDifficultyCell[]>();

    insight?.topicDifficultyHeatmap.forEach((cell) => {
      const bucket = groups.get(cell.subject) ?? [];
      bucket.push(cell);
      groups.set(cell.subject, bucket);
    });

    return [...groups.entries()].map(([subject, cells]) => ({
      subject,
      cells,
    }));
  }, [insight?.topicDifficultyHeatmap]);

  const dayHeaders = useMemo(() => {
    const uniqueDays = new Map<string, string>();
    insight?.classPeriodConfusionHeatmap.forEach((cell) => {
      if (!uniqueDays.has(cell.dayKey)) {
        uniqueDays.set(cell.dayKey, cell.dayLabel);
      }
    });

    return [...uniqueDays.entries()].map(([key, label]) => ({ key, label }));
  }, [insight?.classPeriodConfusionHeatmap]);

  const heatmapRows = useMemo(() => {
    const rows = new Map<string, { slotLabel: string; cells: WeeklyHeatmapCell[] }>();

    insight?.classPeriodConfusionHeatmap.forEach((cell) => {
      const current = rows.get(cell.slotKey) ?? {
        slotLabel: cell.slotLabel,
        cells: [],
      };
      current.cells.push(cell);
      rows.set(cell.slotKey, current);
    });

    return [...rows.entries()].map(([slotKey, value]) => ({
      slotKey,
      slotLabel: value.slotLabel,
      cells: value.cells,
    }));
  }, [insight?.classPeriodConfusionHeatmap]);

  const maxInterventionRecovery = Math.max(
    ...((insight?.interventionEffectivenessTrends ?? []).map((item) => item.avgRecoveryScore)),
    0
  );
  const maxSubjectComprehension = Math.max(
    ...((insight?.subjectComprehension ?? []).map((item) => item.avgComprehensionScore)),
    0
  );
  const maxLanguageFriction = Math.max(
    ...((insight?.languageFrictionTrend ?? []).map((item) => item.frictionRate)),
    0
  );

  const applyCustomRange = () => {
    if (!isValidDateKey(customStartDate) || !isValidDateKey(customEndDate)) {
      setCustomRangeError("Use YYYY-MM-DD for both dates.");
      return;
    }

    if (customStartDate > customEndDate) {
      setCustomRangeError("Start date must be before the end date.");
      return;
    }

    setAppliedCustomRange({
      startDate: customStartDate,
      endDate: customEndDate,
    });
    setPreset("custom");
    setCustomRangeError(null);
  };

  const showEmptyState = !isLoading && (!insight || insight.totalSessions === 0);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void refresh("pull");
            }}
            tintColor={colors.primary[600]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Weekly Teaching Coach</Text>
            <Text style={styles.subtitle}>
              Cross-session analytics for difficulty patterns, misconception drift, intervention quality, and revision priorities.
            </Text>
          </View>
          <View style={styles.headerBadges}>
            <Badge label={range.label} variant="primary" size="md" />
            <Badge
              label={isSyncing ? "Refreshing…" : `Updated ${formatGeneratedAt(lastGeneratedAt)}`}
              variant={isSyncing ? "info" : "neutral"}
              size="md"
            />
          </View>
        </View>

        <Card variant="default" padding="lg" style={styles.card}>
          <View style={styles.rangeHeader}>
            <View style={styles.rangeCopy}>
              <Text style={styles.cardTitle}>Date Range</Text>
              <Text style={styles.cardDescription}>
                Switch between this week, last week, or a custom range. Cached insights render first, then the dashboard recomputes in the background.
              </Text>
            </View>
            <View style={styles.rangeButtonRow}>
              <RangeButton
                label="This Week"
                active={preset === "this_week"}
                onPress={() => {
                  setPreset("this_week");
                  setCustomRangeError(null);
                }}
              />
              <RangeButton
                label="Last Week"
                active={preset === "last_week"}
                onPress={() => {
                  setPreset("last_week");
                  setCustomRangeError(null);
                }}
              />
              <RangeButton
                label="Custom"
                active={preset === "custom"}
                onPress={() => {
                  setPreset("custom");
                }}
              />
            </View>
          </View>

          {preset === "custom" ? (
            <View style={styles.customRangePanel}>
              <View style={styles.customInputRow}>
                <View style={styles.customInputGroup}>
                  <Text style={styles.inputLabel}>Start date</Text>
                  <TextInput
                    value={customStartDate}
                    onChangeText={setCustomStartDate}
                    placeholder="2026-03-23"
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>
                <View style={styles.customInputGroup}>
                  <Text style={styles.inputLabel}>End date</Text>
                  <TextInput
                    value={customEndDate}
                    onChangeText={setCustomEndDate}
                    placeholder="2026-03-29"
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.customFooter}>
                <Button title="Apply Custom Range" onPress={applyCustomRange} variant="secondary" />
                <Text style={styles.customHint}>
                  Current range: {appliedCustomRange.startDate} to {appliedCustomRange.endDate}
                </Text>
              </View>

              {customRangeError ? (
                <Text style={styles.errorText}>{customRangeError}</Text>
              ) : null}
            </View>
          ) : null}
        </Card>

        {syncError ? (
          <Card variant="outlined" padding="lg" style={styles.errorCard}>
            <Text style={styles.errorTitle}>Weekly sync needs attention</Text>
            <Text style={styles.errorText}>{syncError}</Text>
          </Card>
        ) : null}

        {isLoading && !insight ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={styles.loadingText}>Building your weekly teaching intelligence…</Text>
          </View>
        ) : null}

        {showEmptyState ? (
          <Card variant="outlined" padding="lg" style={styles.card}>
            <Text style={styles.emptyTitle}>Weekly analytics need more session history</Text>
            <Text style={styles.emptyText}>
              End and save a few class sessions in the selected range, then pull to refresh this dashboard.
            </Text>
          </Card>
        ) : null}

        {insight && insight.totalSessions > 0 ? (
          <>
            <View style={styles.metricsGrid}>
              <MetricCard
                label="Sessions"
                value={`${insight.totalSessions}`}
                hint={`${range.label}`}
              />
              <MetricCard
                label="Avg confusion"
                value={insight.averageConfusionIndex.toFixed(1)}
                hint="Peak confusion signal"
              />
              <MetricCard
                label="Avg recovery"
                value={insight.averageRecoveryScore.toFixed(1)}
                hint="Across all sessions"
              />
              <MetricCard
                label="Avg participants"
                value={insight.averageParticipants.toFixed(1)}
                hint="Students per class"
              />
            </View>

            <Card variant="default" padding="lg" style={[styles.card, styles.coachingCard]}>
              <View style={styles.coachingHeader}>
                <View>
                  <Text style={styles.coachingEyebrow}>AI Coaching Output</Text>
                  <Text style={styles.coachingTitle}>What the week is telling you</Text>
                </View>
                <Badge label="Teaching coach" variant="primary" size="md" />
              </View>

              <Text style={styles.coachingNarrative}>{insight.coaching.narrative}</Text>

              <View style={styles.coachingGrid}>
                <View style={styles.coachStat}>
                  <Text style={styles.coachStatLabel}>Most difficult topic</Text>
                  <Text style={styles.coachStatValue}>
                    {insight.coaching.mostDifficultTopic}
                  </Text>
                </View>
                <View style={styles.coachStat}>
                  <Text style={styles.coachStatLabel}>Worst time slot</Text>
                  <Text style={styles.coachStatValue}>{insight.coaching.worstTimeSlot}</Text>
                </View>
                <View style={styles.coachStat}>
                  <Text style={styles.coachStatLabel}>Best intervention style</Text>
                  <Text style={styles.coachStatValue}>
                    {insight.coaching.bestInterventionStyle}
                  </Text>
                </View>
              </View>

              <View style={styles.priorityBlock}>
                <Text style={styles.priorityTitle}>Recommended revision priorities</Text>
                <View style={styles.priorityList}>
                  {insight.coaching.revisionPriorities.map((priority) => (
                    <View key={priority} style={styles.priorityItem}>
                      <View style={styles.priorityDot} />
                      <Text style={styles.priorityText}>{priority}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Topic Difficulty Heatmap</Text>
                  <Text style={styles.cardDescription}>
                    Topics are colored by cross-session difficulty, combining confusion peaks, low recovery, and how often they reappear.
                  </Text>
                </View>
                <Badge
                  label={`${insight.topicDifficultyHeatmap.length} topic signals`}
                  variant="info"
                  size="md"
                />
              </View>

              <View style={styles.topicLegend}>
                <Badge label="Low difficulty" variant="success" />
                <Badge label="Medium" variant="warning" />
                <Badge label="High" variant="error" />
              </View>

              <View style={styles.topicGroups}>
                {topicGroups.slice(0, 4).map((group) => (
                  <View key={group.subject} style={styles.topicGroup}>
                    <Text style={styles.topicGroupTitle}>{group.subject}</Text>
                    <View style={styles.topicGrid}>
                      {group.cells.slice(0, 4).map((cell) => (
                        <TopicDifficultyCell key={cell.key} cell={cell} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Class Period Confusion Heatmap</Text>
                  <Text style={styles.cardDescription}>
                    Each cell shows average confusion for that weekday and time-slot bucket.
                  </Text>
                </View>
                <Badge label="Hotter = harder" variant="warning" size="md" />
              </View>

              <View style={styles.heatmapTable}>
                <View style={styles.heatmapHeaderRow}>
                  <View style={styles.heatmapCorner} />
                  {dayHeaders.map((day) => (
                    <Text key={day.key} style={styles.heatmapHeaderLabel}>
                      {day.label}
                    </Text>
                  ))}
                </View>

                {heatmapRows.map((row) => (
                  <View key={row.slotKey} style={styles.heatmapRow}>
                    <Text style={styles.heatmapRowLabel}>{row.slotLabel}</Text>
                    {row.cells.map((cell) => (
                      <HeatmapCellView key={cell.key} cell={cell} />
                    ))}
                  </View>
                ))}
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Recurring Misconception Clusters</Text>
                  <Text style={styles.cardDescription}>
                    Cross-session misconception clusters surface the same confusion themes even when they show up in different classes.
                  </Text>
                </View>
                <Badge
                  label={`${insight.recurringMisconceptions.length} clusters`}
                  variant="primary"
                  size="md"
                />
              </View>

              <View style={styles.listBlock}>
                {insight.recurringMisconceptions.slice(0, 5).map((cluster) => (
                  <View key={cluster.key} style={styles.listRow}>
                    <View style={styles.listRowCopy}>
                      <Text style={styles.listRowTitle}>{cluster.title}</Text>
                      <Text style={styles.listRowMeta}>
                        {cluster.frequency} appearances · {cluster.totalAffectedStudents} affected students · {cluster.subjects.join(", ")}
                      </Text>
                    </View>
                    <Badge label={formatReasonChip(cluster.dominantReasonChip)} variant="warning" />
                  </View>
                ))}
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Intervention Effectiveness Trends</Text>
                  <Text style={styles.cardDescription}>
                    Average recovery is ranked by intervention style, with a trend badge showing whether results are improving or slipping.
                  </Text>
                </View>
                <Badge label="Recovery trend" variant="info" size="md" />
              </View>

              <View style={styles.listBlock}>
                {insight.interventionEffectivenessTrends.slice(0, 6).map((trend) => (
                  <InterventionTrendRow
                    key={trend.type}
                    trend={trend}
                    maxRecoveryScore={maxInterventionRecovery}
                  />
                ))}
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Language Friction Trend</Text>
                  <Text style={styles.cardDescription}>
                    Daily bars show the share of sessions that surfaced language friction as a dominant reason chip or misconception theme.
                  </Text>
                </View>
                <Badge label="Daily trend" variant="info" size="md" />
              </View>

              <View style={styles.languageTrendRow}>
                {insight.languageFrictionTrend.map((point) => (
                  <View key={point.date} style={styles.languageBarColumn}>
                    <View style={styles.languageBarTrack}>
                      <View
                        style={[
                          styles.languageBarFill,
                          {
                            height: `${
                              maxLanguageFriction > 0
                                ? Math.max((point.frictionRate / maxLanguageFriction) * 100, point.sessionCount > 0 ? 8 : 0)
                                : 0
                            }%`,
                            backgroundColor:
                              point.frictionRate >= 60
                                ? colors.status.error
                                : point.frictionRate >= 30
                                  ? colors.status.warning
                                  : colors.status.info,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.languageBarValue}>
                      {point.sessionCount > 0 ? `${point.frictionRate.toFixed(0)}%` : "—"}
                    </Text>
                    <Text style={styles.languageBarLabel}>{point.label}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <Card variant="default" padding="lg" style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>Subject-wise Comprehension</Text>
                  <Text style={styles.cardDescription}>
                    Comprehension is based on where confusion ends by the close of each session, not just how high it peaks.
                  </Text>
                </View>
                <Badge label="Higher is better" variant="success" size="md" />
              </View>

              <View style={styles.listBlock}>
                {insight.subjectComprehension.map((item) => (
                  <SubjectComprehensionRow
                    key={item.subject}
                    item={item}
                    maxScore={maxSubjectComprehension}
                  />
                ))}
              </View>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing["3xl"],
    gap: spacing.lg,
  },

  // Header
  header: {
    gap: spacing.md,
  },
  headerCopy: {
    gap: spacing.xs,
  },
  title: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  headerBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },

  // Cards
  card: {
    gap: spacing.lg,
    borderRadius: borderRadius["2xl"],
  },

  // Range selector
  rangeHeader: {
    gap: spacing.base,
  },
  rangeCopy: {
    gap: spacing.xs,
  },
  rangeButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  rangeButton: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.backgroundAlt,
  },
  rangeButtonActive: {
    backgroundColor: colors.primary[600],
  },
  rangeButtonText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  rangeButtonTextActive: {
    color: colors.text.inverse,
  },

  // Custom range
  customRangePanel: {
    gap: spacing.base,
  },
  customInputRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  customInputGroup: {
    flex: 1,
    minWidth: 160,
    gap: spacing.xs,
  },
  inputLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  input: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    ...textStyles.bodyMedium,
  },
  customFooter: {
    gap: spacing.sm,
  },
  customHint: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },

  // Loading
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing["4xl"],
    gap: spacing.base,
  },
  loadingText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },

  // Error
  errorCard: {
    backgroundColor: colors.status.errorBg,
    borderRadius: borderRadius.xl,
  },
  errorTitle: {
    ...textStyles.headingSmall,
    color: "#991B1B",
    fontWeight: "700",
  },
  errorText: {
    ...textStyles.bodyMedium,
    color: "#991B1B",
  },

  // Empty
  emptyTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },

  // Metrics grid
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 160,
    borderRadius: borderRadius.xl,
  },
  metricLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  metricValue: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  metricHint: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    marginTop: spacing.sm,
  },

  // AI Coaching card (dark)
  coachingCard: {
    backgroundColor: colors.dark.surface,
    borderRadius: borderRadius["2xl"],
    ...shadows.lg,
  },
  coachingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  coachingEyebrow: {
    ...textStyles.label,
    color: colors.primary[200],
    letterSpacing: 0.4,
  },
  coachingTitle: {
    ...textStyles.headingLarge,
    color: colors.text.inverse,
    letterSpacing: -0.2,
  },
  coachingNarrative: {
    ...textStyles.bodyLarge,
    color: colors.dark.text,
    lineHeight: 26,
  },
  coachingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  coachStat: {
    flexGrow: 1,
    flexBasis: 180,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.dark.surfaceLight,
    gap: spacing.xs,
  },
  coachStatLabel: {
    ...textStyles.bodySmall,
    color: colors.dark.textSecondary,
  },
  coachStatValue: {
    ...textStyles.bodyLarge,
    color: colors.text.inverse,
    fontWeight: "600",
  },
  priorityBlock: {
    gap: spacing.sm,
  },
  priorityTitle: {
    ...textStyles.headingSmall,
    color: colors.text.inverse,
  },
  priorityList: {
    gap: spacing.sm,
  },
  priorityItem: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary[300],
    marginTop: 8,
  },
  priorityText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.dark.text,
  },

  // Card headers
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.base,
    flexWrap: "wrap",
  },
  cardTitle: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  cardDescription: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    maxWidth: 620,
    lineHeight: 22,
  },

  // Topic difficulty heatmap
  topicLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  topicGroups: {
    gap: spacing.lg,
  },
  topicGroup: {
    gap: spacing.sm,
  },
  topicGroupTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  topicGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.base,
  },
  topicCell: {
    flexGrow: 1,
    flexBasis: 180,
    minHeight: 120,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.base,
    gap: spacing.sm,
  },
  topicCellSubject: {
    ...textStyles.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  topicCellTopic: {
    ...textStyles.headingSmall,
    fontWeight: "600",
  },
  topicCellFooter: {
    marginTop: "auto",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  topicCellMeta: {
    ...textStyles.bodySmall,
    fontWeight: "600",
  },

  // Class period heatmap
  heatmapTable: {
    gap: spacing.sm,
  },
  heatmapHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heatmapCorner: {
    width: 96,
  },
  heatmapHeaderLabel: {
    flex: 1,
    textAlign: "center",
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  heatmapRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  heatmapRowLabel: {
    width: 96,
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
    paddingTop: spacing.base,
  },
  heatmapCell: {
    flex: 1,
    minHeight: 76,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xs,
    gap: spacing.xxs,
  },
  heatmapValue: {
    ...textStyles.headingSmall,
    fontWeight: "700",
  },
  heatmapMeta: {
    ...textStyles.caption,
  },

  // List blocks
  listBlock: {
    gap: spacing.base,
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
  },
  listRowCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  listRowTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "600",
  },
  listRowMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },

  // Intervention trend rows
  interventionRow: {
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
  },
  interventionRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  interventionRowCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  interventionName: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "600",
  },
  interventionMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },

  // Progress bars
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.backgroundAlt,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: borderRadius.full,
  },
  interventionRecovery: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },

  // Language friction trend
  languageTrendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  languageBarColumn: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  languageBarTrack: {
    width: "100%",
    height: 112,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.backgroundAlt,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  languageBarFill: {
    width: "100%",
    borderRadius: borderRadius.xl,
  },
  languageBarValue: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  languageBarLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    textAlign: "center",
  },

  // Subject comprehension
  subjectRow: {
    gap: spacing.sm,
  },
  subjectRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.base,
  },
  subjectName: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "600",
  },
  subjectMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
});
