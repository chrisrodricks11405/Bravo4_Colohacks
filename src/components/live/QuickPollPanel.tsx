import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { PollDistributionSnapshot, QuickPollPayload } from "../../types";
import { Badge, Button, Card } from "../ui";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

interface QuickPollPanelProps {
  activePoll: QuickPollPayload | null;
  aiAvailable: boolean;
  canGenerateFromCluster: boolean;
  clusterTitle?: string;
  draftQuestion: string;
  draftOptions: string[];
  editingDraftId?: string | null;
  editingSource: QuickPollPayload["source"];
  isClosing: boolean;
  isGeneratingAI: boolean;
  isProcessingVoicePrompt: boolean;
  isPushing: boolean;
  isRecordingVoicePrompt: boolean;
  isSavingDraft: boolean;
  pollDistribution: PollDistributionSnapshot | null;
  pollHistory: QuickPollPayload[];
  selectedPoll: QuickPollPayload | null;
  selectedPollId?: string | null;
  voiceError?: string | null;
  voiceToPollEnabled: boolean;
  voiceTranscript?: string;
  onAddOption: () => void;
  onChangeOption: (index: number, nextValue: string) => void;
  onChangeQuestion: (nextValue: string) => void;
  onClosePoll: () => void;
  onGenerateAI: () => void;
  onLoadDraft: (pollId: string) => void;
  onPushNow: () => void;
  onRemoveOption: (index: number) => void;
  onResetComposer: () => void;
  onSaveDraft: () => void;
  onSelectPoll: (pollId: string) => void;
  onStartVoicePrompt: () => void;
  onStopVoicePrompt: () => void;
}

function formatStatus(status: QuickPollPayload["status"]) {
  switch (status) {
    case "active":
      return "Live now";
    case "closed":
      return "Closed";
    default:
      return "Draft";
  }
}

function getStatusVariant(status: QuickPollPayload["status"]) {
  switch (status) {
    case "active":
      return "success" as const;
    case "closed":
      return "neutral" as const;
    default:
      return "warning" as const;
  }
}

export function QuickPollPanel({
  activePoll,
  aiAvailable,
  canGenerateFromCluster,
  clusterTitle,
  draftQuestion,
  draftOptions,
  editingDraftId,
  editingSource,
  isClosing,
  isGeneratingAI,
  isProcessingVoicePrompt,
  isPushing,
  isRecordingVoicePrompt,
  isSavingDraft,
  pollDistribution,
  pollHistory,
  selectedPoll,
  selectedPollId,
  voiceError,
  voiceToPollEnabled,
  voiceTranscript,
  onAddOption,
  onChangeOption,
  onChangeQuestion,
  onClosePoll,
  onGenerateAI,
  onLoadDraft,
  onPushNow,
  onRemoveOption,
  onResetComposer,
  onSaveDraft,
  onSelectPoll,
  onStartVoicePrompt,
  onStopVoicePrompt,
}: QuickPollPanelProps) {
  return (
    <Card variant="default" padding="lg" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={styles.badgeRow}>
            <Badge label="Zone G" variant="primary" size="md" />
            <Badge label="Manual always works" variant="info" size="md" />
            <Badge
              label={aiAvailable ? "AI poll ready" : "AI unavailable"}
              variant={aiAvailable ? "success" : "neutral"}
              size="md"
            />
          </View>
          <Text style={styles.title}>Quick Poll Composer</Text>
          <Text style={styles.subtitle}>
            Draft a poll manually or generate one from the focused cluster, edit it, push it to students, then watch live answer bars update.
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <Card variant="outlined" padding="lg" style={styles.composeCard}>
          <Text style={styles.composeTitle}>Compose</Text>
          <Text style={styles.composeHint}>
            {clusterTitle
              ? `Focused cluster: ${clusterTitle}`
              : "Manual polls are ready even before a cluster forms."}
          </Text>

          {voiceToPollEnabled || voiceTranscript ? (
            <View style={styles.voiceCard}>
              <View style={styles.voiceHeader}>
                <View style={styles.voiceHeaderCopy}>
                  <Text style={styles.voiceTitle}>Voice to poll</Text>
                  <Text style={styles.voiceHint}>
                    Speak a question, let AI structure it into an MCQ draft, then review before pushing.
                  </Text>
                </View>
                <Badge
                  label={voiceTranscript ? "Transcript ready" : "Hands-free"}
                  variant={voiceTranscript ? "success" : "info"}
                  size="sm"
                />
              </View>

              <View style={styles.voiceActions}>
                <Button
                  title={isRecordingVoicePrompt ? "Recording..." : "Start speaking"}
                  onPress={onStartVoicePrompt}
                  variant={isRecordingVoicePrompt ? "danger" : "secondary"}
                  size="sm"
                  disabled={isRecordingVoicePrompt || isProcessingVoicePrompt}
                />
                <Button
                  title={
                    isProcessingVoicePrompt ? "Structuring..." : "Stop & structure"
                  }
                  onPress={onStopVoicePrompt}
                  variant="outline"
                  size="sm"
                  disabled={!isRecordingVoicePrompt || isProcessingVoicePrompt}
                />
              </View>

              {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}

              {voiceTranscript ? (
                <View style={styles.transcriptCard}>
                  <Text style={styles.transcriptLabel}>Latest transcript</Text>
                  <Text style={styles.transcriptText}>{voiceTranscript}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Question</Text>
            <TextInput
              value={draftQuestion}
              onChangeText={onChangeQuestion}
              placeholder="Which part feels most clear right now?"
              placeholderTextColor={colors.text.tertiary}
              style={[styles.input, styles.questionInput]}
              multiline
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.optionHeader}>
              <Text style={styles.fieldLabel}>Answer options</Text>
              <Button
                title="Add option"
                onPress={onAddOption}
                variant="ghost"
                size="sm"
                disabled={draftOptions.length >= 4}
              />
            </View>

            <View style={styles.optionList}>
              {draftOptions.map((option, index) => (
                <View key={`option-${index}`} style={styles.optionRow}>
                  <View style={styles.optionIndex}>
                    <Text style={styles.optionIndexText}>
                      {String.fromCharCode(65 + index)}
                    </Text>
                  </View>
                  <TextInput
                    value={option}
                    onChangeText={(nextValue) => onChangeOption(index, nextValue)}
                    placeholder={`Option ${index + 1}`}
                    placeholderTextColor={colors.text.tertiary}
                    style={[styles.input, styles.optionInput]}
                  />
                  <Button
                    title="Remove"
                    onPress={() => onRemoveOption(index)}
                    variant="ghost"
                    size="sm"
                    disabled={draftOptions.length <= 2}
                  />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.composerMeta}>
            <Badge
              label={editingSource === "ai_generated" ? "AI-generated draft" : "Manual draft"}
              variant={editingSource === "ai_generated" ? "info" : "neutral"}
              size="sm"
            />
            {editingDraftId ? (
              <Badge label="Editing saved draft" variant="warning" size="sm" />
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <Button
              title="Generate from cluster"
              onPress={onGenerateAI}
              variant="secondary"
              size="md"
              disabled={!aiAvailable || !canGenerateFromCluster}
              loading={isGeneratingAI}
              style={styles.actionButton}
            />
            <Button
              title={editingDraftId ? "Update draft" : "Save draft"}
              onPress={onSaveDraft}
              variant="outline"
              size="md"
              loading={isSavingDraft}
              style={styles.actionButton}
            />
            <Button
              title="Push Now"
              onPress={onPushNow}
              size="md"
              loading={isPushing}
              style={styles.actionButton}
            />
            <Button
              title="Reset"
              onPress={onResetComposer}
              variant="ghost"
              size="md"
              style={styles.actionButton}
            />
          </View>
        </Card>

        <View style={styles.sideColumn}>
          <Card variant="outlined" padding="lg" style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.composeTitle}>Poll lifecycle</Text>
                <Text style={styles.composeHint}>
                  Create, push, collect, close, and reopen past polls from local plus Supabase history.
                </Text>
              </View>
              <Badge
                label={pollHistory.length > 0 ? `${pollHistory.length} saved` : "No polls yet"}
                variant={pollHistory.length > 0 ? "primary" : "neutral"}
                size="sm"
              />
            </View>

            <ScrollView
              style={styles.historyList}
              contentContainerStyle={styles.historyListContent}
              nestedScrollEnabled
            >
              {pollHistory.length === 0 ? (
                <Text style={styles.emptyText}>
                  Your poll history will appear here after the first draft is saved.
                </Text>
              ) : (
                pollHistory.map((poll) => {
                  const isSelected = poll.id === selectedPollId;

                  return (
                    <TouchableOpacity
                      key={poll.id}
                      activeOpacity={0.85}
                      onPress={() => onSelectPoll(poll.id)}
                    >
                      <View
                        style={[
                          styles.historyItem,
                          isSelected && styles.historyItemSelected,
                        ]}
                      >
                        <View style={styles.historyItemHeader}>
                          <Text style={styles.historyQuestion}>{poll.question}</Text>
                          <Badge
                            label={formatStatus(poll.status)}
                            variant={getStatusVariant(poll.status)}
                            size="sm"
                          />
                        </View>
                        <Text style={styles.historyMeta}>
                          {poll.source === "ai_generated" ? "AI" : "Manual"} ·{" "}
                          {poll.options.length} options
                          {poll.clusterTitle ? ` · ${poll.clusterTitle}` : ""}
                        </Text>

                        {poll.status === "draft" ? (
                          <Button
                            title="Edit draft"
                            onPress={() => onLoadDraft(poll.id)}
                            variant="ghost"
                            size="sm"
                            style={styles.editDraftButton}
                          />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Card>

          <Card variant="elevated" padding="lg" style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <View style={styles.resultsHeaderCopy}>
                <Text style={styles.composeTitle}>Live results</Text>
                <Text style={styles.composeHint}>
                  {selectedPoll
                    ? selectedPoll.question
                    : "Select or push a poll to start watching the answer bars."}
                </Text>
              </View>

              {selectedPoll ? (
                <Badge
                  label={formatStatus(selectedPoll.status)}
                  variant={getStatusVariant(selectedPoll.status)}
                  size="sm"
                />
              ) : null}
            </View>

            {selectedPoll ? (
              <>
                <View style={styles.resultsMetaRow}>
                  <Badge
                    label={`${pollDistribution?.totalResponses ?? 0} responses`}
                    variant="info"
                    size="sm"
                  />
                  {activePoll?.id === selectedPoll.id ? (
                    <Badge label="Collecting live" variant="success" size="sm" />
                  ) : null}
                </View>

                <View style={styles.chart}>
                  {selectedPoll.options.map((option) => {
                    const optionResult =
                      pollDistribution?.distribution.find(
                        (entry) => entry.optionIndex === option.index
                      ) ?? null;
                    const percent = optionResult?.percent ?? 0;
                    const count = optionResult?.count ?? 0;
                    const isLeader =
                      pollDistribution?.leadingOptionIndex === option.index &&
                      (pollDistribution?.totalResponses ?? 0) > 0;

                    return (
                      <View key={option.index} style={styles.barRow}>
                        <View style={styles.barLabelRow}>
                          <Text style={styles.barLabel}>
                            {String.fromCharCode(65 + option.index)}. {option.text}
                          </Text>
                          <Text style={styles.barValue}>
                            {count} · {percent.toFixed(1)}%
                          </Text>
                        </View>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                width: `${Math.max(percent, count > 0 ? 8 : 0)}%`,
                              },
                              isLeader && styles.barFillLeader,
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>

                {selectedPoll.rationale ? (
                  <View style={styles.rationaleCard}>
                    <Text style={styles.rationaleLabel}>AI rationale</Text>
                    <Text style={styles.rationaleText}>{selectedPoll.rationale}</Text>
                  </View>
                ) : null}

                <View style={styles.resultsActions}>
                  <Button
                    title="Close poll"
                    onPress={onClosePoll}
                    variant="outline"
                    size="md"
                    disabled={selectedPoll.status !== "active"}
                    loading={isClosing}
                    style={styles.resultsActionButton}
                  />
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>
                Save or push a poll and the live answer distribution will render here.
              </Text>
            )}
          </Card>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.base,
  },
  header: {
    gap: spacing.xs,
  },
  headerCopy: {
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
  grid: {
    flexDirection: "row",
    gap: spacing.base,
    flexWrap: "wrap",
  },
  composeCard: {
    flex: 1.2,
    minWidth: 360,
    gap: spacing.base,
  },
  sideColumn: {
    flex: 1,
    minWidth: 320,
    gap: spacing.base,
  },
  composeTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  composeHint: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  voiceCard: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.primary[100],
    backgroundColor: colors.primary[50],
    gap: spacing.sm,
  },
  voiceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  voiceHeaderCopy: {
    flex: 1,
  },
  voiceTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  voiceHint: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  voiceActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  voiceError: {
    ...textStyles.bodySmall,
    color: colors.status.error,
  },
  transcriptCard: {
    padding: spacing.base,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.border,
    gap: spacing.xs,
  },
  transcriptLabel: {
    ...textStyles.label,
    color: colors.text.tertiary,
  },
  transcriptText: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
  },
  fieldLabel: {
    ...textStyles.label,
    color: colors.text.tertiary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface.card,
    color: colors.text.primary,
    ...textStyles.bodyMedium,
  },
  questionInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  optionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.base,
  },
  optionList: {
    gap: spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  optionIndex: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  optionIndexText: {
    ...textStyles.bodySmall,
    color: colors.primary[700],
    fontWeight: "700",
  },
  optionInput: {
    flex: 1,
  },
  composerMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionButton: {
    minWidth: 138,
  },
  historyCard: {
    gap: spacing.base,
    flex: 1,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  historyList: {
    maxHeight: 280,
  },
  historyListContent: {
    gap: spacing.sm,
  },
  historyItem: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.card,
    gap: spacing.xs,
  },
  historyItemSelected: {
    borderColor: colors.primary[300],
    backgroundColor: colors.primary[50],
  },
  historyItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  historyQuestion: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "600",
    flex: 1,
  },
  historyMeta: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  editDraftButton: {
    alignSelf: "flex-start",
  },
  resultsCard: {
    gap: spacing.base,
  },
  resultsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  resultsHeaderCopy: {
    flex: 1,
  },
  resultsMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chart: {
    gap: spacing.sm,
  },
  barRow: {
    gap: spacing.xs,
  },
  barLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  barLabel: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    flex: 1,
  },
  barValue: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  barTrack: {
    height: 14,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.borderLight,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[400],
  },
  barFillLeader: {
    backgroundColor: colors.status.success,
  },
  rationaleCard: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface.borderLight,
    gap: spacing.xs,
  },
  rationaleLabel: {
    ...textStyles.label,
    color: colors.text.tertiary,
  },
  rationaleText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  resultsActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  resultsActionButton: {
    minWidth: 132,
  },
  emptyText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
});
