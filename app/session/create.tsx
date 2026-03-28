import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Badge, Button, Card } from "../../src/components/ui";
import { hasSupabaseConfig } from "../../src/lib/supabase";
import { useAuth, useSessionHydration } from "../../src/providers";
import { createSession } from "../../src/services";
import { useNetworkStore, usePreferencesStore, useSessionStore } from "../../src/stores";
import { borderRadius, colors, spacing, textStyles } from "../../src/theme";

const sessionSchema = z.object({
  subject: z.string().trim().min(2, "Enter the subject."),
  topic: z.string().trim().min(2, "Enter the lesson topic."),
  gradeClass: z.string().trim().min(1, "Enter the class or grade."),
  language: z.string().trim().min(2, "Enter the teaching language."),
  lostThreshold: z.number().min(10).max(90),
  mode: z.enum(["online", "offline"]),
  lessonPlanSeed: z.string().trim().max(500, "Keep the lesson seed under 500 characters."),
});

type SessionFormValues = z.infer<typeof sessionSchema>;

function ModeOption({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.modeOption, selected && styles.modeOptionSelected]}
    >
      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{label}</Text>
      <Text style={[styles.modeDescription, selected && styles.modeDescriptionSelected]}>
        {description}
      </Text>
    </TouchableOpacity>
  );
}

function InputField({
  label,
  error,
  multiline = false,
  children,
}: {
  label: string;
  error?: string;
  multiline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {multiline ? <Text style={styles.fieldHint}>Optional, but useful for AI scaffolding later.</Text> : null}
    </View>
  );
}

export default function CreateSessionScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { user } = useAuth();
  const { isHydrating } = useSessionHydration();
  const setSession = useSessionStore((state) => state.setSession);
  const activeSession = useSessionStore((state) => state.session);
  const setNetworkMode = useNetworkStore((state) => state.setMode);
  const isConnected = useNetworkStore((state) => state.isConnected);
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);
  const preferences = usePreferencesStore((state) => ({
    defaultSubject: state.defaultSubject,
    defaultGradeClass: state.defaultGradeClass,
    defaultLanguage: state.defaultLanguage,
    defaultLostThreshold: state.defaultLostThreshold,
  }));

  const initialMode = mode === "offline" ? "offline" : "online";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      subject: preferences.defaultSubject ?? "",
      topic: "",
      gradeClass: preferences.defaultGradeClass ?? "",
      language: preferences.defaultLanguage,
      lostThreshold: preferences.defaultLostThreshold,
      mode: initialMode,
      lessonPlanSeed: "",
    },
  });

  const selectedMode = watch("mode");
  const willSyncImmediately =
    selectedMode === "online" && supabaseReachable && hasSupabaseConfig;
  const hasResumableSession =
    activeSession?.status === "lobby" || activeSession?.status === "active";

  const currentSessionRoute =
    hasResumableSession && activeSession
      ? activeSession.status === "active"
        ? "/session/live"
        : "/session/lobby"
      : null;

  const onSubmit = handleSubmit(async (values) => {
    if (!user?.id) {
      setSubmitError("Your teacher account is missing. Please sign in again.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const session = await createSession(values, {
        teacherId: user.id,
        attemptRemoteSync: willSyncImmediately,
        queueOnFailure: true,
      });

      setSession(session);
      setNetworkMode(session.mode === "offline" ? "local_hotspot" : "online");
      router.replace({
        pathname: "/session/lobby",
        params: { sessionId: session.id },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "We could not create the session right now."
      );
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Badge
              label={selectedMode === "offline" ? "Offline hotspot flow" : "Realtime session flow"}
              variant={selectedMode === "offline" ? "warning" : "primary"}
              size="md"
              style={styles.headerBadge}
            />
            <Text style={styles.title}>Start Session</Text>
            <Text style={styles.subtitle}>
              Create the teacher-facing session, generate the join code, and open the lobby with a live QR ready for students.
            </Text>
          </View>

          {hasResumableSession && activeSession && currentSessionRoute ? (
            <Card variant="default" padding="lg" style={styles.resumeCard}>
              <View style={styles.resumeHeader}>
                <View style={styles.resumeCopy}>
                  <Text style={styles.resumeTitle}>A session is already in progress</Text>
                  <Text style={styles.resumeText}>
                    {activeSession.subject} · {activeSession.topic} · code {activeSession.joinCode}. Starting a new session replaces the locally active one.
                  </Text>
                </View>
                <Badge
                  label={activeSession.status === "active" ? "Class live" : "Lobby open"}
                  variant={activeSession.status === "active" ? "success" : "info"}
                  size="md"
                />
              </View>
              <Button
                title={activeSession.status === "active" ? "Open Live Dashboard" : "Resume Lobby"}
                onPress={() => router.replace(currentSessionRoute)}
                variant="outline"
                size="md"
                style={styles.resumeButton}
              />
            </Card>
          ) : null}

          <View style={styles.columns}>
            <Card variant="elevated" padding="lg" style={styles.formCard}>
              <Text style={styles.sectionTitle}>Class setup</Text>
              <Text style={styles.sectionSubtitle}>
                These settings become the lobby metadata, QR payload, and local session snapshot.
              </Text>

              <InputField label="Session mode">
                <Controller
                  control={control}
                  name="mode"
                  render={({ field: { value, onChange } }) => (
                    <View style={styles.modeGrid}>
                      <ModeOption
                        label="Online"
                        description="Uses Supabase create + Realtime join counts."
                        selected={value === "online"}
                        onPress={() => onChange("online")}
                      />
                      <ModeOption
                        label="Offline hotspot"
                        description="Creates locally first and queues remote sync for later."
                        selected={value === "offline"}
                        onPress={() => onChange("offline")}
                      />
                    </View>
                  )}
                />
              </InputField>

              <InputField label="Subject" error={errors.subject?.message}>
                <Controller
                  control={control}
                  name="subject"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="Science"
                      placeholderTextColor={colors.text.tertiary}
                      style={styles.input}
                    />
                  )}
                />
              </InputField>

              <InputField label="Topic" error={errors.topic?.message}>
                <Controller
                  control={control}
                  name="topic"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="States of matter"
                      placeholderTextColor={colors.text.tertiary}
                      style={styles.input}
                    />
                  )}
                />
              </InputField>

              <View style={styles.row}>
                <View style={styles.rowField}>
                  <InputField label="Class / Grade" error={errors.gradeClass?.message}>
                    <Controller
                      control={control}
                      name="gradeClass"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          placeholder="Grade 7"
                          placeholderTextColor={colors.text.tertiary}
                          style={styles.input}
                        />
                      )}
                    />
                  </InputField>
                </View>

                <View style={styles.rowField}>
                  <InputField label="Language" error={errors.language?.message}>
                    <Controller
                      control={control}
                      name="language"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          placeholder="English"
                          placeholderTextColor={colors.text.tertiary}
                          style={styles.input}
                        />
                      )}
                    />
                  </InputField>
                </View>
              </View>

              <InputField label="Lost threshold" error={errors.lostThreshold?.message}>
                <Controller
                  control={control}
                  name="lostThreshold"
                  render={({ field: { value, onChange } }) => (
                    <View style={styles.sliderWrap}>
                      <View style={styles.sliderHeader}>
                        <Text style={styles.sliderValue}>{Math.round(value)}%</Text>
                        <Text style={styles.sliderHint}>Trigger level for classroom support signals</Text>
                      </View>
                      <Slider
                        value={value}
                        onValueChange={(nextValue) => onChange(Math.round(nextValue))}
                        minimumValue={10}
                        maximumValue={90}
                        step={1}
                        minimumTrackTintColor={colors.primary[600]}
                        maximumTrackTintColor={colors.surface.border}
                        thumbTintColor={colors.primary[700]}
                      />
                      <View style={styles.sliderLegend}>
                        <Text style={styles.sliderLegendText}>10%</Text>
                        <Text style={styles.sliderLegendText}>90%</Text>
                      </View>
                    </View>
                  )}
                />
              </InputField>

              <InputField
                label="Lesson plan seed"
                error={errors.lessonPlanSeed?.message}
                multiline
              >
                <Controller
                  control={control}
                  name="lessonPlanSeed"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="Optional notes, learning objective, or starter prompt..."
                      placeholderTextColor={colors.text.tertiary}
                      multiline
                      textAlignVertical="top"
                      style={[styles.input, styles.textArea]}
                    />
                  )}
                />
              </InputField>

              {submitError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{submitError}</Text>
                </View>
              ) : null}

              <Button
                title={isSubmitting ? "Creating session..." : "Create Session"}
                onPress={onSubmit}
                loading={isSubmitting}
                size="lg"
                fullWidth
              />
            </Card>

            <View style={styles.sideColumn}>
              <Card variant="default" padding="lg" style={styles.infoCard}>
                <Text style={styles.sideTitle}>What happens next</Text>
                <Text style={styles.sideText}>
                  The app generates a 4-digit code, creates the active session locally, attempts Supabase sync when available, and opens the lobby with a QR for student joins.
                </Text>

                <View style={styles.statusStack}>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Network</Text>
                    <Badge
                      label={isConnected ? "Connected" : "Offline"}
                      variant={isConnected ? "success" : "warning"}
                      size="md"
                    />
                  </View>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Supabase</Text>
                    <Badge
                      label={
                        hasSupabaseConfig
                          ? willSyncImmediately
                            ? "Create + Realtime"
                            : "Queued for later"
                          : "Local only"
                      }
                      variant={
                        hasSupabaseConfig
                          ? willSyncImmediately
                            ? "success"
                            : "warning"
                          : "neutral"
                      }
                      size="md"
                    />
                  </View>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Persistence</Text>
                    <Badge label="SQLite active session" variant="info" size="md" />
                  </View>
                </View>
              </Card>

              <Card variant="default" padding="lg" style={styles.infoCard}>
                <Text style={styles.sideTitle}>Session defaults</Text>
                <Text style={styles.sideText}>
                  Subject, class, language, and threshold start from your teacher preferences so the form opens nearly ready to launch.
                </Text>
                <Text style={styles.defaultsText}>
                  {preferences.defaultSubject ?? "Subject unset"}{"\n"}
                  {preferences.defaultGradeClass ?? "Class unset"}{"\n"}
                  {preferences.defaultLanguage} language{"\n"}
                  {preferences.defaultLostThreshold}% default threshold
                </Text>
              </Card>

              {!hasSupabaseConfig || !isConnected || selectedMode === "offline" ? (
                <Card variant="outlined" padding="lg" style={styles.noticeCard}>
                  <Badge label="Offline-first safety" variant="warning" size="md" />
                  <Text style={styles.noticeText}>
                    {selectedMode === "offline"
                      ? "Hotspot mode prioritizes the local classroom flow. Realtime joins are disabled until you move back to an online session."
                      : !isConnected
                        ? "You are offline, so the session will still open locally and queue remote sync jobs."
                        : "Supabase is not configured yet, so this device will run in local-only mode."}
                  </Text>
                </Card>
              ) : null}
            </View>
          </View>

          {isHydrating ? (
            <Text style={styles.footerText}>Restoring any saved session state in the background…</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: spacing["3xl"],
    gap: spacing.xl,
  },
  header: {
    gap: spacing.sm,
  },
  headerBadge: {
    alignSelf: "flex-start",
  },
  title: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    maxWidth: 860,
  },
  resumeCard: {
    borderColor: colors.primary[100],
  },
  resumeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  resumeCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  resumeTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  resumeText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  resumeButton: {
    alignSelf: "flex-start",
    marginTop: spacing.lg,
  },
  columns: {
    flexDirection: "row",
    gap: spacing.xl,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  formCard: {
    flex: 1.35,
    minWidth: 460,
  },
  sideColumn: {
    flex: 0.95,
    minWidth: 320,
    gap: spacing.base,
  },
  sectionTitle: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },
  sectionSubtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...textStyles.label,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  fieldError: {
    ...textStyles.bodySmall,
    color: "#991B1B",
    marginTop: spacing.xs,
  },
  fieldHint: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    ...textStyles.bodyMedium,
  },
  textArea: {
    minHeight: 120,
  },
  modeGrid: {
    flexDirection: "row",
    gap: spacing.base,
  },
  modeOption: {
    flex: 1,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.card,
    gap: spacing.xs,
  },
  modeOptionSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  modeLabel: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  modeLabelSelected: {
    color: colors.primary[700],
  },
  modeDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  modeDescriptionSelected: {
    color: colors.primary[700],
  },
  row: {
    flexDirection: "row",
    gap: spacing.base,
  },
  rowField: {
    flex: 1,
  },
  sliderWrap: {
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.card,
  },
  sliderHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.base,
    marginBottom: spacing.sm,
  },
  sliderValue: {
    ...textStyles.metricSmall,
    color: colors.primary[700],
  },
  sliderHint: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    flex: 1,
    textAlign: "right",
  },
  sliderLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  sliderLegendText: {
    ...textStyles.caption,
    color: colors.text.tertiary,
  },
  errorBox: {
    backgroundColor: colors.status.errorBg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: "#991B1B",
  },
  infoCard: {
    gap: spacing.base,
  },
  sideTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  sideText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  statusStack: {
    gap: spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.base,
  },
  statusLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  defaultsText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    lineHeight: 26,
  },
  noticeCard: {
    backgroundColor: "#FFF9ED",
    borderColor: "#FDE68A",
    gap: spacing.base,
  },
  noticeText: {
    ...textStyles.bodyMedium,
    color: "#92400E",
  },
  footerText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
  },
});
