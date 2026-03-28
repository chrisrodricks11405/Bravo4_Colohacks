import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { ReteachPack } from "../../types";
import { Badge, Button, Card } from "../ui";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

type ReteachTabKey =
  | "simple"
  | "local"
  | "analogy"
  | "board"
  | "misconception";

interface AIReteachPanelProps {
  clusterTitle?: string;
  representativeQuestion?: string;
  pack: ReteachPack | null;
  isAvailable: boolean;
  isLoading: boolean;
  voiceAvailable: boolean;
  isSpeaking: boolean;
  onGenerate: () => void;
  onCopy: (label: string, text: string) => void;
  onSpeak: (label: string, text: string) => void;
  onStopSpeaking: () => void;
}

export function AIReteachPanel({
  clusterTitle,
  representativeQuestion,
  pack,
  isAvailable,
  isLoading,
  voiceAvailable,
  isSpeaking,
  onGenerate,
  onCopy,
  onSpeak,
  onStopSpeaking,
}: AIReteachPanelProps) {
  const sections = useMemo(
    () => [
      {
        key: "simple" as const,
        label: "Simpler",
        title: "Simpler explanation",
        value: pack?.simpleExplanation ?? "",
      },
      {
        key: "local" as const,
        label: "Local language",
        title: "Local-language explanation",
        value:
          pack?.localLanguageExplanation ??
          "No local-language version is available for this cluster yet.",
      },
      {
        key: "analogy" as const,
        label: "Analogy",
        title: "Analogy-based explanation",
        value: pack?.analogyExplanation ?? "",
      },
      {
        key: "board" as const,
        label: "Board script",
        title: "One-minute board script",
        value: pack?.boardScript ?? "",
      },
      {
        key: "misconception" as const,
        label: "Misconception",
        title: "Misconception-specific example",
        value: pack?.misconceptionExample ?? "",
      },
    ],
    [pack]
  );

  const [activeTab, setActiveTab] = useState<ReteachTabKey>("simple");

  useEffect(() => {
    setActiveTab("simple");
  }, [pack?.simpleExplanation, pack?.boardScript]);

  const activeSection =
    sections.find((section) => section.key === activeTab) ?? sections[0];

  return (
    <Card variant="default" padding="lg" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.badgeRow}>
            <Badge label="Zone F" variant="primary" size="md" />
            <Badge
              label={isAvailable ? "AI ready" : "AI unavailable"}
              variant={isAvailable ? "success" : "neutral"}
              size="md"
            />
            {voiceAvailable ? (
              <Badge label="Read aloud ready" variant="info" size="md" />
            ) : null}
          </View>
          <Text style={styles.title}>AI Reteach Panel</Text>
          <Text style={styles.subtitle}>
            Generate an instant reteach pack from the active misconception cluster and copy each explanation style in one tap.
          </Text>
        </View>

        <Button
          title={pack ? "Refresh pack" : "Generate pack"}
          onPress={onGenerate}
          variant="secondary"
          size="md"
          disabled={!isAvailable}
          loading={isLoading}
          style={styles.generateButton}
        />
      </View>

      <View style={styles.contextCard}>
        <Text style={styles.contextLabel}>Focused cluster</Text>
        <Text style={styles.contextValue}>
          {clusterTitle ?? "Pick a live cluster to generate reteach support."}
        </Text>
        <Text style={styles.contextSupporting}>
          {representativeQuestion
            ? `"${representativeQuestion}"`
            : "The panel stays ready and will fill with explanation variants once a cluster is selected."}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {sections.map((section) => {
          const isSelected = section.key === activeTab;

          return (
            <TouchableOpacity
              key={section.key}
              activeOpacity={0.8}
              onPress={() => setActiveTab(section.key)}
              style={[styles.tabButton, isSelected && styles.tabButtonSelected]}
            >
              <Text style={[styles.tabText, isSelected && styles.tabTextSelected]}>
                {section.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Card variant="outlined" padding="lg" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderCopy}>
            <Text style={styles.sectionTitle}>{activeSection.title}</Text>
            <Text style={styles.sectionHint}>
              Copy this variant directly into your board talk, notebook note, or bilingual classroom explanation.
            </Text>
          </View>

          <Button
            title="Copy"
            onPress={() => onCopy(activeSection.title, activeSection.value)}
            variant="outline"
            size="sm"
            disabled={!pack || activeSection.value.trim().length === 0}
            style={styles.copyButton}
          />
          {voiceAvailable ? (
            <Button
              title={isSpeaking ? "Stop audio" : "Read aloud"}
              onPress={() =>
                isSpeaking
                  ? onStopSpeaking()
                  : onSpeak(activeSection.title, activeSection.value)
              }
              variant="ghost"
              size="sm"
              disabled={!pack || activeSection.value.trim().length === 0}
              style={styles.copyButton}
            />
          ) : null}
        </View>

        <Text style={styles.sectionBody}>
          {pack
            ? activeSection.value
            : isAvailable
              ? "Generate a reteach pack to unlock explanation variants for this cluster."
              : "AI is unavailable right now. Manual teaching actions and poll creation still work."}
        </Text>
      </Card>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.base,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.base,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  title: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  generateButton: {
    minWidth: 148,
  },
  contextCard: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary[50],
    gap: spacing.xs,
  },
  contextLabel: {
    ...textStyles.label,
    color: colors.primary[700],
  },
  contextValue: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "700",
  },
  contextSupporting: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  tabRow: {
    gap: spacing.sm,
  },
  tabButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.borderLight,
  },
  tabButtonSelected: {
    backgroundColor: colors.primary[600],
  },
  tabText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  tabTextSelected: {
    color: colors.text.inverse,
  },
  sectionCard: {
    gap: spacing.base,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  sectionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  sectionHint: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  copyButton: {
    minWidth: 84,
  },
  sectionBody: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
});
