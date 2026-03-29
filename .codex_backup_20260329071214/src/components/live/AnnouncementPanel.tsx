import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { borderRadius, colors, spacing, textStyles } from "../../theme";
import { Card, Button } from "../ui";
import type { SessionAnnouncementRecord } from "../../services/studentEngagement";

interface AnnouncementPanelProps {
  title: string;
  body: string;
  isSending: boolean;
  history: SessionAnnouncementRecord[];
  onChangeTitle: (value: string) => void;
  onChangeBody: (value: string) => void;
  onSend: () => void;
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function AnnouncementPanel({
  title,
  body,
  isSending,
  history,
  onChangeTitle,
  onChangeBody,
  onSend,
}: AnnouncementPanelProps) {
  return (
    <Card variant="default" padding="lg" style={styles.card}>
      <Text style={styles.title}>Teacher announcements</Text>
      <Text style={styles.subtitle}>
        Broadcast a quick note to every student and keep the history visible in one place.
      </Text>

      <View style={styles.inputGroup}>
        <TextInput
          value={title}
          onChangeText={onChangeTitle}
          placeholder="Optional title"
          placeholderTextColor={colors.text.tertiary}
          style={styles.input}
        />
        <TextInput
          value={body}
          onChangeText={onChangeBody}
          placeholder="Share a cue, reminder, or transition note"
          placeholderTextColor={colors.text.tertiary}
          multiline
          textAlignVertical="top"
          style={styles.textArea}
        />
        <Button
          title="Send announcement"
          onPress={onSend}
          loading={isSending}
          disabled={body.trim().length === 0}
        />
      </View>

      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Recent history</Text>
        <Text style={styles.historyCount}>
          {history.length > 0 ? `${history.length} sent` : "No announcements yet"}
        </Text>
      </View>

      <ScrollView style={styles.historyList} nestedScrollEnabled>
        {history.map((item) => (
          <View key={item.id} style={styles.historyItem}>
            <View style={styles.historyTopRow}>
              <Text style={styles.historyItemTitle}>
                {item.title ?? "Teacher announcement"}
              </Text>
              <Text style={styles.historyTime}>{formatTime(item.issuedAt)}</Text>
            </View>
            <Text style={styles.historyBody}>{item.body}</Text>
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  title: {
    ...textStyles.titleMd,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodySm,
    color: colors.text.tertiary,
  },
  inputGroup: {
    gap: spacing.sm,
  },
  input: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surface.borderGhost,
    backgroundColor: colors.surface.backgroundAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
  },
  textArea: {
    minHeight: 104,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.surface.borderGhost,
    backgroundColor: colors.surface.backgroundAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text.primary,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyTitle: {
    ...textStyles.labelLg,
    color: colors.text.secondary,
  },
  historyCount: {
    ...textStyles.bodySm,
    color: colors.text.tertiary,
  },
  historyList: {
    maxHeight: 220,
  },
  historyItem: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    backgroundColor: colors.surface.backgroundAlt,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  historyTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  historyItemTitle: {
    ...textStyles.labelLg,
    color: colors.text.primary,
    flex: 1,
  },
  historyTime: {
    ...textStyles.bodySm,
    color: colors.text.tertiary,
  },
  historyBody: {
    ...textStyles.bodyMd,
    color: colors.text.secondary,
  },
});
