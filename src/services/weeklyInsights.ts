import { getDatabase } from "../db";
import type {
  AIWeeklyCoaching,
  InterventionActionPayload,
  ReasonChip,
  SessionSummaryPayload,
  WeeklyDateRange,
  WeeklyHeatmapCell,
  WeeklyInsightAggregate,
  WeeklyInsightPayload,
  WeeklyInterventionTrend,
  WeeklyLanguageFrictionPoint,
  WeeklyRangePreset,
  WeeklyRecurringMisconception,
  WeeklySubjectComprehension,
  WeeklyTopicDifficultyCell,
} from "../types";
import { aiProvider } from "./ai";
import { listSessionSummaries } from "./summaries";

type WeeklyInsightCacheRow = {
  cache_key: string;
  teacher_id: string | null;
  range_preset: string;
  start_date: string;
  end_date: string;
  summary_count: number;
  source_updated_at: string | null;
  payload: string;
  created_at: string;
  updated_at: string;
};

type WeeklyInsightOptions = {
  teacherId: string;
  range: WeeklyDateRange;
};

type DayConfig = {
  key: string;
  label: string;
};

type SlotConfig = {
  key: string;
  label: string;
};

const UPSERT_WEEKLY_CACHE_SQL = `
  INSERT INTO weekly_insight_cache (
    cache_key,
    teacher_id,
    range_preset,
    start_date,
    end_date,
    summary_count,
    source_updated_at,
    payload,
    created_at,
    updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET
    teacher_id = excluded.teacher_id,
    range_preset = excluded.range_preset,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    summary_count = excluded.summary_count,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    updated_at = excluded.updated_at;
`;

const EMPTY_WEEKLY_COACHING: AIWeeklyCoaching = {
  mostDifficultTopic: "Not enough sessions yet",
  worstTimeSlot: "Not enough sessions yet",
  bestInterventionStyle: "Not enough interventions yet",
  revisionPriorities: ["Teach a few more sessions in this range to unlock coaching."],
  narrative: "Weekly coaching will become more specific after multiple saved summaries.",
};

const WEEKDAY_SEQUENCE: DayConfig[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const PERIOD_SEQUENCE: SlotConfig[] = [
  { key: "morning", label: "Morning" },
  { key: "late_morning", label: "Late Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "late_day", label: "Late Day" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function padNumber(value: number) {
  return value.toString().padStart(2, "0");
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

export function isValidDateKey(value: string) {
  return parseDateKey(value) != null;
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function shiftDate(date: Date, deltaDays: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + deltaDays);
  return next;
}

function getWeekStart(date: Date) {
  const next = new Date(date);
  const weekdayIndex = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - weekdayIndex);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getWeekEnd(date: Date) {
  return shiftDate(getWeekStart(date), 6);
}

function formatRangeLabel(startDate: Date, endDate: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function dateKeyToStartIso(dateKey: string) {
  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error("Invalid date key.");
  }

  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function dateKeyToEndExclusiveIso(dateKey: string) {
  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error("Invalid date key.");
  }

  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function resolveWeeklyDateRange(
  preset: WeeklyRangePreset,
  customRange?: { startDate: string; endDate: string }
): WeeklyDateRange {
  const today = new Date();
  let rangeStart: Date;
  let rangeEnd: Date;

  if (preset === "last_week") {
    const previousWeekReference = shiftDate(today, -7);
    rangeStart = getWeekStart(previousWeekReference);
    rangeEnd = getWeekEnd(previousWeekReference);
  } else if (preset === "custom") {
    const startDate = parseDateKey(customRange?.startDate ?? "");
    const endDate = parseDateKey(customRange?.endDate ?? "");

    if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) {
      throw new Error("Custom range must include a valid start and end date.");
    }

    rangeStart = startDate;
    rangeEnd = endDate;
  } else {
    rangeStart = getWeekStart(today);
    rangeEnd = getWeekEnd(today);
  }

  const startDate = formatDateKey(rangeStart);
  const endDate = formatDateKey(rangeEnd);

  return {
    preset,
    startDate,
    endDate,
    startAt: dateKeyToStartIso(startDate),
    endExclusiveAt: dateKeyToEndExclusiveIso(endDate),
    label: formatRangeLabel(rangeStart, rangeEnd),
  };
}

function normalizeTeacherId(teacherId: string) {
  return teacherId.trim() || "local_teacher";
}

function buildCacheKey(teacherId: string, range: WeeklyDateRange) {
  return `${teacherId}:${range.preset}:${range.startDate}:${range.endDate}`;
}

async function saveWeeklyInsightCache(
  payload: WeeklyInsightPayload,
  summaryCount: number,
  sourceUpdatedAt: string | null
) {
  const db = await getDatabase();
  const timestamp = new Date().toISOString();

  await db.runAsync(
    UPSERT_WEEKLY_CACHE_SQL,
    payload.cacheKey,
    payload.teacherId,
    payload.range.preset,
    payload.range.startDate,
    payload.range.endDate,
    summaryCount,
    sourceUpdatedAt,
    JSON.stringify(payload),
    timestamp,
    timestamp
  );
}

function getWeekdayConfig(date: Date) {
  return WEEKDAY_SEQUENCE[(date.getDay() + 6) % 7];
}

function getPeriodConfig(date: Date) {
  const hour = date.getHours();

  if (hour < 10) {
    return PERIOD_SEQUENCE[0];
  }

  if (hour < 12) {
    return PERIOD_SEQUENCE[1];
  }

  if (hour < 15) {
    return PERIOD_SEQUENCE[2];
  }

  return PERIOD_SEQUENCE[3];
}

function getDifficultyScore(summary: SessionSummaryPayload) {
  return clamp(
    summary.peakConfusionIndex * 0.55 +
      summary.endingConfusionIndex * 0.2 +
      (100 - summary.overallRecoveryScore) * 0.25,
    0,
    100
  );
}

function getComprehensionScore(summary: SessionSummaryPayload) {
  return clamp(100 - summary.endingConfusionIndex, 0, 100);
}

function hasLanguageFriction(summary: SessionSummaryPayload) {
  return (
    summary.topReasonChips.some((chip) => chip.chip === "language_friction") ||
    summary.topClusters.some((cluster) => cluster.reasonChip === "language_friction")
  );
}

function normalizeClusterKey(title: string) {
  return title.trim().toLowerCase();
}

function getDominantReasonChip(
  counts: Map<ReasonChip, number>
): ReasonChip {
  const ranked = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  )[0];

  return ranked?.[0] ?? "other";
}

function getTrendDirection(delta: number): WeeklyInterventionTrend["trendDirection"] {
  if (delta >= 5) {
    return "up";
  }

  if (delta <= -5) {
    return "down";
  }

  return "stable";
}

function formatTrendDateLabel(dateKey: string) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function listDateKeysInRange(startDate: string, endDate: string) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);

  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }

  const keys: string[] = [];
  let cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    keys.push(formatDateKey(cursor));
    cursor = shiftDate(cursor, 1);
  }

  return keys;
}

function buildTopicDifficultyHeatmap(
  summaries: SessionSummaryPayload[]
): WeeklyTopicDifficultyCell[] {
  const grouped = new Map<
    string,
    {
      subject: string;
      topic: string;
      sessionCount: number;
      difficultyScoreSum: number;
      peakConfusionSum: number;
      endingConfusionSum: number;
      recoveryScoreSum: number;
    }
  >();

  summaries.forEach((summary) => {
    const key = `${summary.subject}::${summary.topic}`.toLowerCase();
    const current = grouped.get(key) ?? {
      subject: summary.subject,
      topic: summary.topic,
      sessionCount: 0,
      difficultyScoreSum: 0,
      peakConfusionSum: 0,
      endingConfusionSum: 0,
      recoveryScoreSum: 0,
    };

    current.sessionCount += 1;
    current.difficultyScoreSum += getDifficultyScore(summary);
    current.peakConfusionSum += summary.peakConfusionIndex;
    current.endingConfusionSum += summary.endingConfusionIndex;
    current.recoveryScoreSum += summary.overallRecoveryScore;
    grouped.set(key, current);
  });

  return [...grouped.entries()]
    .map(([key, entry]) => ({
      key,
      subject: entry.subject,
      topic: entry.topic,
      avgDifficultyScore: roundToSingleDecimal(
        entry.difficultyScoreSum / entry.sessionCount
      ),
      avgPeakConfusionIndex: roundToSingleDecimal(
        entry.peakConfusionSum / entry.sessionCount
      ),
      avgEndingConfusionIndex: roundToSingleDecimal(
        entry.endingConfusionSum / entry.sessionCount
      ),
      avgRecoveryScore: roundToSingleDecimal(
        entry.recoveryScoreSum / entry.sessionCount
      ),
      sessionCount: entry.sessionCount,
    }))
    .sort(
      (left, right) =>
        right.avgDifficultyScore - left.avgDifficultyScore ||
        right.sessionCount - left.sessionCount ||
        left.subject.localeCompare(right.subject) ||
        left.topic.localeCompare(right.topic)
    );
}

function buildClassPeriodHeatmap(
  summaries: SessionSummaryPayload[]
): WeeklyHeatmapCell[] {
  const cells = new Map<
    string,
    {
      dayKey: string;
      dayLabel: string;
      slotKey: string;
      slotLabel: string;
      sessionCount: number;
      confusionSum: number;
      recoverySum: number;
    }
  >();

  WEEKDAY_SEQUENCE.forEach((day) => {
    PERIOD_SEQUENCE.forEach((slot) => {
      const key = `${day.key}:${slot.key}`;
      cells.set(key, {
        dayKey: day.key,
        dayLabel: day.label,
        slotKey: slot.key,
        slotLabel: slot.label,
        sessionCount: 0,
        confusionSum: 0,
        recoverySum: 0,
      });
    });
  });

  summaries.forEach((summary) => {
    const sessionDate = new Date(summary.createdAt);
    const day = getWeekdayConfig(sessionDate);
    const slot = getPeriodConfig(sessionDate);
    const key = `${day.key}:${slot.key}`;
    const current = cells.get(key);

    if (!current) {
      return;
    }

    current.sessionCount += 1;
    current.confusionSum += summary.peakConfusionIndex;
    current.recoverySum += summary.overallRecoveryScore;
  });

  return PERIOD_SEQUENCE.flatMap((slot) =>
    WEEKDAY_SEQUENCE.map((day) => {
      const cell = cells.get(`${day.key}:${slot.key}`);

      return {
        key: `${day.key}:${slot.key}`,
        dayKey: day.key,
        dayLabel: day.label,
        slotKey: slot.key,
        slotLabel: slot.label,
        avgConfusionIndex:
          cell && cell.sessionCount > 0
            ? roundToSingleDecimal(cell.confusionSum / cell.sessionCount)
            : 0,
        avgRecoveryScore:
          cell && cell.sessionCount > 0
            ? roundToSingleDecimal(cell.recoverySum / cell.sessionCount)
            : 0,
        sessionCount: cell?.sessionCount ?? 0,
      } satisfies WeeklyHeatmapCell;
    })
  );
}

function buildRecurringMisconceptions(
  summaries: SessionSummaryPayload[]
): WeeklyRecurringMisconception[] {
  const grouped = new Map<
    string,
    {
      title: string;
      frequency: number;
      totalAffectedStudents: number;
      subjects: Set<string>;
      reasonCounts: Map<ReasonChip, number>;
    }
  >();

  summaries.forEach((summary) => {
    summary.topClusters.forEach((cluster) => {
      const key = normalizeClusterKey(cluster.title);
      const current = grouped.get(key) ?? {
        title: cluster.title,
        frequency: 0,
        totalAffectedStudents: 0,
        subjects: new Set<string>(),
        reasonCounts: new Map<ReasonChip, number>(),
      };

      current.frequency += 1;
      current.totalAffectedStudents += Math.max(cluster.affectedCount, 1);
      current.subjects.add(summary.subject);
      current.reasonCounts.set(
        cluster.reasonChip,
        (current.reasonCounts.get(cluster.reasonChip) ?? 0) +
          Math.max(cluster.affectedCount, 1)
      );
      grouped.set(key, current);
    });
  });

  return [...grouped.entries()]
    .map(([key, entry]) => ({
      key,
      title: entry.title,
      frequency: entry.frequency,
      totalAffectedStudents: entry.totalAffectedStudents,
      subjects: [...entry.subjects].sort(),
      dominantReasonChip: getDominantReasonChip(entry.reasonCounts),
    }))
    .sort(
      (left, right) =>
        right.frequency - left.frequency ||
        right.totalAffectedStudents - left.totalAffectedStudents ||
        left.title.localeCompare(right.title)
    );
}

function buildInterventionEffectivenessTrends(
  summaries: SessionSummaryPayload[]
): WeeklyInterventionTrend[] {
  const grouped = new Map<
    InterventionActionPayload["type"],
    Array<InterventionActionPayload & { recoveryScore: number }>
  >();
  const usageCounts = new Map<InterventionActionPayload["type"], number>();

  summaries.forEach((summary) => {
    summary.interventions.forEach((intervention) => {
      usageCounts.set(
        intervention.type,
        (usageCounts.get(intervention.type) ?? 0) + 1
      );

      if (typeof intervention.recoveryScore !== "number") {
        return;
      }

      const bucket = grouped.get(intervention.type) ?? [];
      bucket.push({
        ...intervention,
        recoveryScore: intervention.recoveryScore,
      });
      grouped.set(intervention.type, bucket);
    });
  });

  return [...usageCounts.entries()]
    .map(([type, usageCount]) => {
      const measured = (grouped.get(type) ?? []).sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp)
      );
      const recoveryValues = measured.map((item) => item.recoveryScore);
      const midpoint = Math.floor(measured.length / 2);
      const earlyAverage =
        midpoint > 0 ? average(recoveryValues.slice(0, midpoint)) : average(recoveryValues);
      const lateAverage =
        midpoint > 0 ? average(recoveryValues.slice(midpoint)) : average(recoveryValues);
      const trendDelta =
        measured.length >= 2 ? roundToSingleDecimal(lateAverage - earlyAverage) : 0;

      return {
        type,
        usageCount,
        avgRecoveryScore: roundToSingleDecimal(average(recoveryValues)),
        successfulCount: measured.filter((item) => item.recoveryScore > 0).length,
        trendDelta,
        trendDirection: getTrendDirection(trendDelta),
      } satisfies WeeklyInterventionTrend;
    })
    .sort(
      (left, right) =>
        right.avgRecoveryScore - left.avgRecoveryScore ||
        right.usageCount - left.usageCount
    );
}

function buildLanguageFrictionTrend(
  summaries: SessionSummaryPayload[],
  range: WeeklyDateRange
): WeeklyLanguageFrictionPoint[] {
  const grouped = new Map<
    string,
    { sessionCount: number; frictionSessionCount: number }
  >();

  listDateKeysInRange(range.startDate, range.endDate).forEach((dateKey) => {
    grouped.set(dateKey, {
      sessionCount: 0,
      frictionSessionCount: 0,
    });
  });

  summaries.forEach((summary) => {
    const dateKey = formatDateKey(new Date(summary.createdAt));
    const current = grouped.get(dateKey);

    if (!current) {
      return;
    }

    current.sessionCount += 1;
    if (hasLanguageFriction(summary)) {
      current.frictionSessionCount += 1;
    }
  });

  return [...grouped.entries()].map(([date, entry]) => ({
    date,
    label: formatTrendDateLabel(date),
    sessionCount: entry.sessionCount,
    frictionSessionCount: entry.frictionSessionCount,
    frictionRate:
      entry.sessionCount > 0
        ? roundToSingleDecimal(
            (entry.frictionSessionCount / entry.sessionCount) * 100
          )
        : 0,
  }));
}

function buildSubjectComprehension(
  summaries: SessionSummaryPayload[]
): WeeklySubjectComprehension[] {
  const grouped = new Map<
    string,
    {
      sessionCount: number;
      comprehensionSum: number;
      recoverySum: number;
    }
  >();

  summaries.forEach((summary) => {
    const current = grouped.get(summary.subject) ?? {
      sessionCount: 0,
      comprehensionSum: 0,
      recoverySum: 0,
    };

    current.sessionCount += 1;
    current.comprehensionSum += getComprehensionScore(summary);
    current.recoverySum += summary.overallRecoveryScore;
    grouped.set(summary.subject, current);
  });

  return [...grouped.entries()]
    .map(([subject, entry]) => ({
      subject,
      avgComprehensionScore: roundToSingleDecimal(
        entry.comprehensionSum / entry.sessionCount
      ),
      avgRecoveryScore: roundToSingleDecimal(entry.recoverySum / entry.sessionCount),
      sessionCount: entry.sessionCount,
    }))
    .sort(
      (left, right) =>
        right.avgComprehensionScore - left.avgComprehensionScore ||
        right.sessionCount - left.sessionCount ||
        left.subject.localeCompare(right.subject)
    );
}

function buildAggregatePayload(
  teacherId: string,
  range: WeeklyDateRange,
  summaries: SessionSummaryPayload[]
): WeeklyInsightAggregate {
  const sortedSummaries = [...summaries].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
  const averageParticipants = roundToSingleDecimal(
    average(sortedSummaries.map((summary) => summary.totalParticipants))
  );
  const averageRecoveryScore = roundToSingleDecimal(
    average(sortedSummaries.map((summary) => summary.overallRecoveryScore))
  );
  const averageConfusionIndex = roundToSingleDecimal(
    average(sortedSummaries.map((summary) => summary.peakConfusionIndex))
  );

  return {
    cacheKey: buildCacheKey(teacherId, range),
    teacherId,
    range,
    generatedAt: new Date().toISOString(),
    totalSessions: sortedSummaries.length,
    averageParticipants,
    averageRecoveryScore,
    averageConfusionIndex,
    topicDifficultyHeatmap: buildTopicDifficultyHeatmap(sortedSummaries),
    classPeriodConfusionHeatmap: buildClassPeriodHeatmap(sortedSummaries),
    recurringMisconceptions: buildRecurringMisconceptions(sortedSummaries),
    interventionEffectivenessTrends:
      buildInterventionEffectivenessTrends(sortedSummaries),
    languageFrictionTrend: buildLanguageFrictionTrend(sortedSummaries, range),
    subjectComprehension: buildSubjectComprehension(sortedSummaries),
  };
}

export async function getCachedWeeklyInsight({
  teacherId,
  range,
}: WeeklyInsightOptions): Promise<WeeklyInsightPayload | null> {
  const db = await getDatabase();
  const cacheKey = buildCacheKey(normalizeTeacherId(teacherId), range);
  const row = await db.getFirstAsync<WeeklyInsightCacheRow>(
    `
      SELECT *
      FROM weekly_insight_cache
      WHERE cache_key = ?
      LIMIT 1;
    `,
    cacheKey
  );

  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.payload) as WeeklyInsightPayload;
  } catch {
    return null;
  }
}

export async function generateWeeklyInsightReport({
  teacherId,
  range,
}: WeeklyInsightOptions): Promise<WeeklyInsightPayload> {
  const normalizedTeacherId = normalizeTeacherId(teacherId);
  const summaries = (await listSessionSummaries({
    startDate: range.startDate,
    endDate: range.endDate,
  })).filter(
    (summary) => !summary.teacherId || summary.teacherId === normalizedTeacherId
  );
  const aggregate = buildAggregatePayload(normalizedTeacherId, range, summaries);
  const coaching =
    summaries.length > 0
      ? await aiProvider.generateWeeklyInsight(aggregate)
      : EMPTY_WEEKLY_COACHING;
  const payload: WeeklyInsightPayload = {
    ...aggregate,
    coaching,
  };
  const latestSourceUpdate =
    summaries
      .map((summary) => summary.updatedAt ?? summary.createdAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

  await saveWeeklyInsightCache(payload, summaries.length, latestSourceUpdate);
  return payload;
}
