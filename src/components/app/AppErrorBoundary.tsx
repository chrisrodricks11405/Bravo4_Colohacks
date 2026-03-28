import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSessionHydration } from "../../providers";
import { useSessionStore } from "../../stores";
import { borderRadius, colors, spacing, textStyles } from "../../theme";
import { Button, Card } from "../ui";
import {
  addMonitoringBreadcrumb,
  captureMonitoringException,
  Sentry,
} from "../../lib/monitoring";
import { sanitizeText } from "../../lib/sanitization";

function resolveRecoveryTarget(session: ReturnType<typeof useSessionStore.getState>["session"]) {
  if (!session?.id) {
    return "/(tabs)" as const;
  }

  if (session.status === "active" || session.status === "paused") {
    return {
      pathname: "/session/live" as const,
      params: { sessionId: session.id },
    };
  }

  if (session.status === "lobby") {
    return {
      pathname: "/session/lobby" as const,
      params: { sessionId: session.id },
    };
  }

  return "/(tabs)" as const;
}

function RecoveryFallback({
  componentStack,
  error,
  resetError,
}: {
  componentStack: string;
  error: unknown;
  resetError: () => void;
}) {
  const router = useRouter();
  const { refreshSession } = useSessionHydration();
  const session = useSessionStore((state) => state.session);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const handleRecover = async () => {
    setIsRecovering(true);
    setRecoveryError(null);

    try {
      await refreshSession();
      addMonitoringBreadcrumb({
        category: "crash-recovery",
        message: "Teacher session restored after boundary reset.",
        data: {
          sessionId: session?.id,
          status: session?.status,
        },
      });
      resetError();
      router.replace(resolveRecoveryTarget(useSessionStore.getState().session));
    } catch (restoreError) {
      const message =
        restoreError instanceof Error
          ? restoreError.message
          : "We couldn't restore the classroom session yet.";
      setRecoveryError(message);
      captureMonitoringException(restoreError, {
        component: "AppErrorBoundary.RecoveryFallback",
      });
    } finally {
      setIsRecovering(false);
    }
  };

  const message =
    session?.status === "active" || session?.status === "lobby"
      ? "The app hit an unexpected error, but the classroom session is still stored locally. You can restore it without losing the live state."
      : "The app hit an unexpected error. You can retry the screen or return to the teacher home workspace.";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Card variant="elevated" padding="lg" style={styles.card}>
          <Text style={styles.kicker}>Recovery Mode</Text>
          <Text style={styles.title}>We can restore this session</Text>
          <Text style={styles.message}>{message}</Text>

          {session ? (
            <View style={styles.sessionMeta}>
              <Text style={styles.sessionMetaLabel}>Saved session</Text>
              <Text style={styles.sessionMetaValue}>
                {session.subject} · {session.topic} · {session.status}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              title={session ? "Restore Session" : "Retry Screen"}
              onPress={() => {
                void handleRecover();
              }}
              loading={isRecovering}
              style={styles.primaryAction}
            />
            <Button
              title="Go to Home"
              onPress={() => {
                resetError();
                router.replace("/(tabs)");
              }}
              variant="outline"
              disabled={isRecovering}
            />
          </View>

          {recoveryError ? <Text style={styles.error}>{recoveryError}</Text> : null}

          <View style={styles.debugBlock}>
            <Text style={styles.debugLabel}>Error snapshot</Text>
            <Text style={styles.debugText}>
              {sanitizeText(
                error instanceof Error ? error.message : "Unknown application error.",
                {
                  allowMultiline: true,
                  maxLength: 240,
                }
              )}
            </Text>
            {componentStack ? (
              <Text style={styles.debugSubtle}>Component stack captured for monitoring.</Text>
            ) : null}
          </View>
        </Card>
      </View>
    </SafeAreaView>
  );
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      showDialog={false}
      beforeCapture={(scope, error, componentStack) => {
        scope.setTag("boundary", "root");
        scope.setContext("react", {
          componentStack: sanitizeText(componentStack, {
            allowMultiline: true,
            maxLength: 1200,
          }),
        });
      }}
      fallback={({ error, componentStack, resetError }) => (
        <RecoveryFallback
          error={error}
          componentStack={componentStack}
          resetError={resetError}
        />
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 720,
    gap: spacing.lg,
  },
  kicker: {
    ...textStyles.label,
    color: colors.primary[700],
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },
  message: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  sessionMeta: {
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary[50],
    padding: spacing.md,
    gap: spacing.xxs,
  },
  sessionMetaLabel: {
    ...textStyles.caption,
    color: colors.primary[700],
  },
  sessionMetaValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  primaryAction: {
    minWidth: 180,
  },
  error: {
    ...textStyles.bodySmall,
    color: colors.status.error,
  },
  debugBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.surface.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  debugLabel: {
    ...textStyles.label,
    color: colors.text.secondary,
  },
  debugText: {
    ...textStyles.bodySmall,
    color: colors.text.primary,
  },
  debugSubtle: {
    ...textStyles.caption,
    color: colors.text.tertiary,
  },
});
