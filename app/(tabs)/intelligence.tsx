import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StateScreen } from "../../src/components/app/StateScreen";
import { Badge, Card } from "../../src/components/ui";
import { useIntelligenceDashboard } from "../../src/hooks/useIntelligenceDashboard";
import type {
  IntelligenceFeature,
  IntelligenceFeatureCategory,
  IntelligenceTone,
} from "../../src/types";
import {
  borderRadius,
  colors,
  shadows,
  spacing,
  textStyles,
} from "../../src/theme";

const FEATURE_GROUPS: Array<{
  category: IntelligenceFeatureCategory;
  title: string;
  subtitle: string;
}> = [
  {
    category: "classroom",
    title: "Classroom Insights",
    subtitle:
      "Spot confusion early, adjust your lesson on the fly, and understand what students are struggling with.",
  },
  {
    category: "recovery",
    title: "Recovery Tools",
    subtitle:
      "Help students catch up with targeted explanations, peer learning suggestions, and adapted teaching approaches.",
  },
  {
    category: "growth",
    title: "Teaching Growth",
    subtitle:
      "Weekly coaching tips and classroom patterns that help you improve lesson by lesson.",
  },
];

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getToneStyles(tone: IntelligenceTone) {
  switch (tone) {
    case "success":
      return {
        borderColor: colors.status.success,
        tintColor: colors.status.successBg,
      };
    case "warning":
      return {
        borderColor: colors.status.warning,
        tintColor: colors.status.warningBg,
      };
    case "error":
      return {
        borderColor: colors.status.error,
        tintColor: colors.status.errorBg,
      };
    case "info":
      return {
        borderColor: colors.status.info,
        tintColor: colors.status.infoBg,
      };
    case "primary":
      return {
        borderColor: colors.primary[600],
        tintColor: colors.primary[50],
      };
    default:
      return {
        borderColor: colors.surface.border,
        tintColor: colors.surface.backgroundAlt,
      };
  }
}

function FeatureCard({ feature }: { feature: IntelligenceFeature }) {
  const toneStyles = getToneStyles(feature.tone);

  return (
    <Card
      variant="default"
      padding="lg"
      style={[styles.featureCard, { borderLeftColor: toneStyles.borderColor }]}
    >
      <View style={styles.featureHeader}>
        <View style={styles.featureHeaderCopy}>
          <Text style={styles.featureName}>{feature.name}</Text>
          <Text style={styles.featureSummary}>{feature.summary}</Text>
        </View>
        <Badge label={feature.statusLabel} variant={feature.tone} size="md" />
      </View>

      <Text style={styles.featureDetail}>{feature.detail}</Text>

      <View style={styles.metricGrid}>
        {feature.metrics.map((metric) => (
          <View
            key={`${feature.key}-${metric.label}`}
            style={[styles.metricTile, { backgroundColor: toneStyles.tintColor }]}
          >
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionStack}>
        {feature.sections.map((section) => (
          <View key={`${feature.key}-${section.title}`} style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionItems}>
              {section.items.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: toneStyles.borderColor }]} />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.recommendedBox, { backgroundColor: toneStyles.tintColor }]}>
        <Text style={styles.recommendedLabel}>Recommended next move</Text>
        <Text style={styles.recommendedText}>{feature.recommendedAction}</Text>
      </View>
    </Card>
  );
}

export default function IntelligenceScreen() {
  const {
    dashboard,
    isLoading,
    isRefreshing,
    isSyncing,
    error,
    lastUpdatedAt,
    refresh,
  } = useIntelligenceDashboard();

  if (isLoading) {
    return (
      <StateScreen
        title="Loading insights"
        message="Preparing your classroom insights and recommendations."
        loading
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={colors.primary[600]}
          />
        }
      >
        <Card variant="dark" padding="xl" style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>AI Insights</Text>
              <Text style={styles.heroTitle}>{dashboard.headline}</Text>
              <Text style={styles.heroSummary}>{dashboard.summary}</Text>
            </View>
            <View style={styles.heroBadges}>
              <Badge
                label={isSyncing ? "Refreshing..." : `Updated ${formatGeneratedAt(lastUpdatedAt)}`}
                variant={isSyncing ? "info" : "neutral"}
                size="md"
              />
              <Badge label={dashboard.metrics[2]?.value ?? "Signals ready"} variant="primary" size="md" />
            </View>
          </View>

          <Text style={styles.heroCoverage}>{dashboard.dataCoverageLabel}</Text>

          <View style={styles.heroMetricGrid}>
            {dashboard.metrics.map((metric) => (
              <View key={metric.label} style={styles.heroMetricTile}>
                <Text style={styles.heroMetricLabel}>{metric.label}</Text>
                <Text style={styles.heroMetricValue}>{metric.value}</Text>
              </View>
            ))}
          </View>
        </Card>

        {error ? (
          <Card variant="default" padding="lg" style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not refresh insights</Text>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        {FEATURE_GROUPS.map((group) => {
          const features = dashboard.features.filter(
            (feature) => feature.category === group.category
          );

          return (
            <View key={group.category} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupSubtitle}>{group.subtitle}</Text>
              </View>

              <View style={styles.featureStack}>
                {features.map((feature) => (
                  <FeatureCard key={feature.key} feature={feature} />
                ))}
              </View>
            </View>
          );
        })}
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
    paddingBottom: spacing["4xl"],
    maxWidth: 1080,
    alignSelf: "center",
    width: "100%",
    gap: spacing.lg,
  },

  heroCard: {
    borderRadius: borderRadius["2xl"],
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.lg,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  heroEyebrow: {
    ...textStyles.label,
    color: colors.dark.textSecondary,
  },
  heroTitle: {
    ...textStyles.displayMedium,
    color: colors.text.inverse,
  },
  heroSummary: {
    ...textStyles.bodyLarge,
    color: colors.dark.text,
    maxWidth: 720,
  },
  heroBadges: {
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  heroCoverage: {
    ...textStyles.bodyMedium,
    color: colors.dark.textSecondary,
    marginTop: spacing.lg,
  },
  heroMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  heroMetricTile: {
    minWidth: 160,
    flexGrow: 1,
    backgroundColor: colors.dark.surfaceLight,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
  },
  heroMetricLabel: {
    ...textStyles.caption,
    color: colors.dark.textSecondary,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  heroMetricValue: {
    ...textStyles.headingSmall,
    color: colors.text.inverse,
    marginTop: spacing.xs,
  },

  errorCard: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.status.errorBg,
  },
  errorTitle: {
    ...textStyles.bodyLarge,
    color: "#991B1B",
    fontWeight: "700",
  },
  errorText: {
    ...textStyles.bodySmall,
    color: "#991B1B",
    marginTop: spacing.xs,
  },

  group: {
    gap: spacing.base,
  },
  groupHeader: {
    gap: spacing.xs,
  },
  groupTitle: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },
  groupSubtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    maxWidth: 820,
  },
  featureStack: {
    gap: spacing.md,
  },

  featureCard: {
    borderRadius: borderRadius["2xl"],
    borderLeftWidth: 4,
    ...shadows.sm,
  },
  featureHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.base,
  },
  featureHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  featureName: {
    ...textStyles.headingMedium,
    color: colors.text.primary,
  },
  featureSummary: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
  },
  featureDetail: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.base,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  metricTile: {
    minWidth: 150,
    flexGrow: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  metricLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  metricValue: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  sectionStack: {
    gap: spacing.base,
    marginTop: spacing.lg,
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "700",
  },
  sectionItems: {
    gap: spacing.sm,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  recommendedBox: {
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    marginTop: spacing.lg,
  },
  recommendedLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  recommendedText: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
});
