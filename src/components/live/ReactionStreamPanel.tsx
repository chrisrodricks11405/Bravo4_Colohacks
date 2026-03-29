import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { borderRadius, colors, spacing, textStyles } from "../../theme";
import { Card } from "../ui";
import type { StudentReactionRecord } from "../../services/studentEngagement";

interface ReactionStreamPanelProps {
  reactions: StudentReactionRecord[];
}

const emojiLabels: Record<StudentReactionRecord["emoji"], string> = {
  thumbs_up: "Thumbs up",
  lightbulb: "Lightbulb",
  question: "Question",
  clap: "Clap",
};

const emojiGlyphs: Record<StudentReactionRecord["emoji"], string> = {
  thumbs_up: "👍",
  lightbulb: "💡",
  question: "❓",
  clap: "👏",
};

export function ReactionStreamPanel({ reactions }: ReactionStreamPanelProps) {
  const counts = reactions.reduce<Record<StudentReactionRecord["emoji"], number>>(
    (accumulator, reaction) => {
      accumulator[reaction.emoji] += 1;
      return accumulator;
    },
    {
      thumbs_up: 0,
      lightbulb: 0,
      question: 0,
      clap: 0,
    }
  );

  return (
    <Card variant="default" padding="lg" style={styles.card}>
      <Text style={styles.title}>Live reactions</Text>
      <Text style={styles.subtitle}>
        Watch the room respond in real time with quick, low-friction signals.
      </Text>

      <View style={styles.summaryRow}>
        {(Object.keys(counts) as Array<StudentReactionRecord["emoji"]>).map((emoji) => (
          <View key={emoji} style={styles.summaryPill}>
            <Text style={styles.summaryEmoji}>{emojiGlyphs[emoji]}</Text>
            <Text style={styles.summaryValue}>{counts[emoji]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.streamList}>
        {reactions.slice(0, 10).map((reaction) => (
          <View key={reaction.id} style={styles.streamItem}>
            <Text style={styles.streamEmoji}>{emojiGlyphs[reaction.emoji]}</Text>
            <Text style={styles.streamLabel}>
              {emojiLabels[reaction.emoji]} from {reaction.anonymousId.slice(-4)}
            </Text>
          </View>
        ))}
        {reactions.length === 0 ? (
          <Text style={styles.empty}>Reactions will appear here once students start responding.</Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  title: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  summaryPill: {
    minWidth: 68,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.backgroundAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    gap: spacing.xs,
  },
  summaryEmoji: {
    fontSize: 18,
  },
  summaryValue: {
    ...textStyles.label,
    color: colors.text.primary,
  },
  streamList: {
    gap: spacing.sm,
  },
  streamItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.backgroundAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  streamEmoji: {
    fontSize: 18,
  },
  streamLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  empty: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
});
