import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import type { ClusterStatus, LessonMarker, MisconceptionClusterSummary } from "../../types";
import { Badge, Button, Card } from "../ui";
import { borderRadius, colors, spacing, textStyles } from "../../theme";

interface MisconceptionClusterDrawerProps {
  visible: boolean;
  clusters: MisconceptionClusterSummary[];
  selectedClusterId?: string | null;
  pinnedClusterIds: string[];
  lessonMarkers: LessonMarker[];
  sessionLanguage?: string;
  onClose: () => void;
  onSelectCluster: (clusterId: string) => void;
  onTogglePin: (clusterId: string) => void;
  onChangeStatus: (clusterId: string, status: ClusterStatus) => void;
  onGeneratePoll: (cluster: MisconceptionClusterSummary) => void;
  onGenerateExplanation: (cluster: MisconceptionClusterSummary) => void;
}

function formatClockTime(value?: string) {
  if (!value) {
    return "No time stamp";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatReasonChip(reasonChip: MisconceptionClusterSummary["reasonChip"]) {
  switch (reasonChip) {
    case "step_unclear":
      return "Step unclear";
    case "language_friction":
      return "Language friction";
    case "missing_prerequisite":
      return "Missing prerequisite";
    case "too_fast":
      return "Pace too fast";
    case "notation_confusion":
      return "Notation confusion";
    case "example_needed":
      return "Example needed";
    default:
      return "Recurring doubt";
  }
}

function getBadgeVariantForReason(
  reasonChip: MisconceptionClusterSummary["reasonChip"]
): "warning" | "info" | "primary" | "neutral" {
  switch (reasonChip) {
    case "step_unclear":
    case "too_fast":
    case "example_needed":
      return "warning";
    case "language_friction":
      return "info";
    case "notation_confusion":
    case "missing_prerequisite":
      return "primary";
    default:
      return "neutral";
  }
}

function getStatusBadgeVariant(
  status: ClusterStatus
): "warning" | "success" | "neutral" | "info" {
  switch (status) {
    case "active":
      return "warning";
    case "acknowledged":
      return "info";
    case "resolved":
      return "success";
    default:
      return "neutral";
  }
}

function formatStatus(status: ClusterStatus) {
  switch (status) {
    case "active":
      return "Active";
    case "acknowledged":
      return "Acknowledged";
    case "resolved":
      return "Resolved";
    case "dismissed":
      return "Dismissed";
    default:
      return "Active";
  }
}

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

export function MisconceptionClusterDrawer({
  visible,
  clusters,
  selectedClusterId,
  pinnedClusterIds,
  lessonMarkers,
  sessionLanguage,
  onClose,
  onSelectCluster,
  onTogglePin,
  onChangeStatus,
  onGeneratePoll,
  onGenerateExplanation,
}: MisconceptionClusterDrawerProps) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(Math.max(width * 0.48, 360), 560);
  const translateX = useRef(new Animated.Value(drawerWidth)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 180,
      }).start();
      return;
    }

    translateX.setValue(drawerWidth);
  }, [drawerWidth, translateX, visible]);

  const selectedCluster = useMemo(
    () =>
      clusters.find((cluster) => cluster.id === selectedClusterId) ?? clusters[0] ?? null,
    [clusters, selectedClusterId]
  );

  const lessonMarkerMap = useMemo(
    () => new Map(lessonMarkers.map((marker) => [marker.id, marker])),
    [lessonMarkers]
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Badge label="Zone E" variant="primary" size="sm" />
            <Text style={styles.title}>Misconception Clusters</Text>
            <Text style={styles.subtitle}>
              Grouped anonymous questions, quick triage, and next-step actions.
            </Text>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <Card variant="outlined" padding="md" style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Visible clusters</Text>
            <Text style={styles.summaryValue}>{clusters.length}</Text>
          </Card>
          <Card variant="outlined" padding="md" style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pinned</Text>
            <Text style={styles.summaryValue}>{pinnedClusterIds.length}</Text>
          </Card>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Grouped doubt cards</Text>
            {clusters.length === 0 ? (
              <Card variant="outlined" padding="lg" style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No live clusters yet</Text>
                <Text style={styles.emptyText}>
                  New anonymous questions will group here automatically when they arrive.
                </Text>
              </Card>
            ) : (
              clusters.map((cluster) => {
                const marker = cluster.lessonMarkerId
                  ? lessonMarkerMap.get(cluster.lessonMarkerId)
                  : undefined;
                const isSelected = selectedCluster?.id === cluster.id;
                const isPinned = pinnedClusterIds.includes(cluster.id);

                return (
                  <TouchableOpacity
                    key={cluster.id}
                    activeOpacity={0.85}
                    onPress={() => onSelectCluster(cluster.id)}
                  >
                    <Card
                      variant={isSelected ? "elevated" : "default"}
                      padding="lg"
                      style={[
                        styles.clusterCard,
                        isSelected && styles.clusterCardSelected,
                      ]}
                    >
                      <View style={styles.clusterHeader}>
                        <View style={styles.clusterHeaderCopy}>
                          <Text style={styles.clusterTitle}>{cluster.title}</Text>
                          <Text style={styles.clusterQuestion}>
                            "{cluster.representativeQuestion}"
                          </Text>
                        </View>

                        <View style={styles.clusterBadgeColumn}>
                          <Badge
                            label={`${cluster.affectedCount} students`}
                            variant="primary"
                            size="sm"
                          />
                          <Badge
                            label={formatStatus(cluster.status)}
                            variant={getStatusBadgeVariant(cluster.status)}
                            size="sm"
                          />
                        </View>
                      </View>

                      <View style={styles.clusterMeta}>
                        <Badge
                          label={formatReasonChip(cluster.reasonChip)}
                          variant={getBadgeVariantForReason(cluster.reasonChip)}
                          size="sm"
                        />
                        {marker ? (
                          <Badge
                            label={`${formatMarkerType(marker.type)} · ${formatClockTime(marker.timestamp)}`}
                            variant="neutral"
                            size="sm"
                          />
                        ) : null}
                        {isPinned ? (
                          <Badge label="Pinned" variant="info" size="sm" />
                        ) : null}
                      </View>

                      <Text style={styles.clusterSummary}>{cluster.summary}</Text>

                      <View style={styles.clusterActions}>
                        <Button
                          title="Focus"
                          onPress={() => onSelectCluster(cluster.id)}
                          variant={isSelected ? "primary" : "secondary"}
                          size="sm"
                          style={styles.clusterActionButton}
                        />
                        <Button
                          title={isPinned ? "Unpin" : "Pin"}
                          onPress={() => onTogglePin(cluster.id)}
                          variant="outline"
                          size="sm"
                          style={styles.clusterActionButton}
                        />
                        <Button
                          title="Acknowledge"
                          onPress={() => onChangeStatus(cluster.id, "acknowledged")}
                          variant="ghost"
                          size="sm"
                          style={styles.clusterActionButton}
                        />
                        <Button
                          title="Dismiss"
                          onPress={() => onChangeStatus(cluster.id, "dismissed")}
                          variant="ghost"
                          size="sm"
                          style={styles.clusterActionButton}
                        />
                      </View>
                    </Card>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {selectedCluster ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cluster detail</Text>
              <Card variant="elevated" padding="lg" style={styles.detailCard}>
                <View style={styles.detailHeader}>
                  <View style={styles.detailHeaderCopy}>
                    <Text style={styles.detailTitle}>{selectedCluster.title}</Text>
                    <Text style={styles.detailSubtitle}>{selectedCluster.summary}</Text>
                  </View>
                  <Badge
                    label={formatStatus(selectedCluster.status)}
                    variant={getStatusBadgeVariant(selectedCluster.status)}
                    size="sm"
                  />
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Representative question</Text>
                  <Text style={styles.detailBody}>
                    "{selectedCluster.representativeQuestion}"
                  </Text>
                </View>

                {selectedCluster.translation ? (
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>Translation</Text>
                    <Text style={styles.detailBody}>{selectedCluster.translation}</Text>
                  </View>
                ) : null}

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Suggested interventions</Text>
                  <View style={styles.suggestionList}>
                    {selectedCluster.suggestedInterventions.map((suggestion) => (
                      <View key={suggestion} style={styles.suggestionPill}>
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Context</Text>
                  <Text style={styles.contextText}>
                    {selectedCluster.affectedCount} students affected
                    {sessionLanguage ? ` · session language ${sessionLanguage}` : ""}
                  </Text>
                  {selectedCluster.lessonMarkerId &&
                  lessonMarkerMap.get(selectedCluster.lessonMarkerId) ? (
                    <Text style={styles.contextText}>
                      Marker:{" "}
                      {formatMarkerType(
                        lessonMarkerMap.get(selectedCluster.lessonMarkerId)?.type ?? "custom"
                      )}{" "}
                      at{" "}
                      {formatClockTime(
                        lessonMarkerMap.get(selectedCluster.lessonMarkerId)?.timestamp
                      )}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.detailActions}>
                  <Button
                    title="Generate Poll"
                    onPress={() => onGeneratePoll(selectedCluster)}
                    variant="primary"
                    size="md"
                    style={styles.detailActionButton}
                  />
                  <Button
                    title="Generate Explanation"
                    onPress={() => onGenerateExplanation(selectedCluster)}
                    variant="secondary"
                    size="md"
                    style={styles.detailActionButton}
                  />
                  <Button
                    title="Mark Resolved"
                    onPress={() => onChangeStatus(selectedCluster.id, "resolved")}
                    variant="outline"
                    size="md"
                    style={styles.detailActionButton}
                  />
                </View>
              </Card>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.surface.overlay,
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: colors.surface.background,
    borderTopLeftRadius: borderRadius["2xl"],
    borderBottomLeftRadius: borderRadius["2xl"],
    borderLeftWidth: 1,
    borderColor: colors.surface.border,
    paddingTop: spacing["2xl"],
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  closeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  closeButtonText: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
    fontWeight: "600",
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.base,
    marginTop: spacing.lg,
  },
  summaryCard: {
    flex: 1,
  },
  summaryLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    textTransform: "uppercase",
  },
  summaryValue: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingBottom: spacing["3xl"],
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  emptyCard: {
    borderStyle: "dashed",
  },
  emptyTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "600",
  },
  emptyText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  clusterCard: {
    gap: spacing.md,
  },
  clusterCardSelected: {
    borderColor: colors.primary[300],
    backgroundColor: "#F8FAFF",
  },
  clusterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  clusterHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  clusterTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "700",
  },
  clusterQuestion: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  clusterBadgeColumn: {
    gap: spacing.xs,
    alignItems: "flex-end",
  },
  clusterMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  clusterSummary: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  clusterActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  clusterActionButton: {
    minWidth: 96,
  },
  detailCard: {
    gap: spacing.base,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    alignItems: "flex-start",
  },
  detailHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  detailTitle: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
  },
  detailSubtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  detailBlock: {
    gap: spacing.sm,
  },
  detailLabel: {
    ...textStyles.label,
    color: colors.text.tertiary,
  },
  detailBody: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  suggestionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  suggestionPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.full,
  },
  suggestionText: {
    ...textStyles.bodySmall,
    color: colors.primary[700],
    fontWeight: "600",
  },
  contextText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  detailActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  detailActionButton: {
    minWidth: 148,
  },
});
