import React, { useState } from "react";
import {
  Alert,
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
import { Button, Card } from "../../src/components/ui";
import { Sentry } from "../../src/lib/monitoring";
import { hasSupabaseConfig } from "../../src/lib/supabase";
import { useAuth, useSessionHydration } from "../../src/providers";
import {
  createSession,
} from "../../src/services";
import { useNetworkStore, usePreferencesStore, useSessionStore } from "../../src/stores";
import { useShallow } from "zustand/react/shallow";
import { borderRadius, colors, shadows, spacing, textStyles } from "../../src/theme";

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

const QUICK_LANGUAGES = ["English", "Hindi", "Marathi", "Kannada"];

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
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
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
  const supabaseReachable = useNetworkStore((state) => state.supabaseReachable);
  const preferences = usePreferencesStore(useShallow((state) => ({
    defaultSubject: state.defaultSubject,
    defaultGradeClass: state.defaultGradeClass,
    defaultLanguage: state.defaultLanguage,
    defaultLostThreshold: state.defaultLostThreshold,
  })));

  const initialMode = mode === "offline" ? "offline" : "online";
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    watch,
    handleSubmit,
    setValue,
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
  const selectedLanguage = watch("language");
  const willSyncImmediately = selectedMode === "online" && supabaseReachable && hasSupabaseConfig;
  const hasResumableSession = activeSession?.status === "lobby" || activeSession?.status === "active";
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
      const session = await createSession(
        values,
        {
          teacherId: user.id,
          attemptRemoteSync: willSyncImmediately,
          queueOnFailure: true,
        }
      );

      setSession(session);
      setNetworkMode(session.mode === "offline" ? "local_hotspot" : "online");
      router.replace({
        pathname: "/session/lobby",
        params: { sessionId: session.id },
      });
    } catch (error) {
      Alert.alert(
        "Could not create session",
        error instanceof Error
          ? error.message
          : "We could not create the session right now."
      );
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
      <Sentry.TimeToInitialDisplay record />
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Form Content - centered */}
          <View style={styles.formWrapper}>
            <Card variant="elevated" padding="xl" style={styles.formCard}>
              {/* Header row */}
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>New Session</Text>
                <Controller
                  control={control}
                  name="mode"
                  render={({ field: { value, onChange } }) => (
                    <View style={styles.modeToggle}>
                      <ModeOption
                        label="Online"
                        description=""
                        selected={value === "online"}
                        onPress={() => onChange("online")}
                      />
                      <ModeOption
                        label="Offline"
                        description=""
                        selected={value === "offline"}
                        onPress={() => onChange("offline")}
                      />
                    </View>
                  )}
                />
              </View>

              {hasResumableSession && activeSession && currentSessionRoute ? (
                <View style={styles.resumeBanner}>
                  <View style={styles.resumeContent}>
                    <Text style={styles.resumeTitle}>Session in progress</Text>
                    <Text style={styles.resumeText}>
                      {activeSession.subject} · {activeSession.topic} · code {activeSession.joinCode}
                    </Text>
                  </View>
                  <Button
                    title={activeSession.status === "active" ? "Open Live" : "Resume Lobby"}
                    onPress={() =>
                      router.replace({
                        pathname: currentSessionRoute,
                        params: { sessionId: activeSession.id },
                      })
                    }
                    variant="secondary"
                    size="sm"
                  />
                </View>
              ) : null}

              {/* Subject & Grade - side by side */}
              <View style={styles.fieldRow}>
                <View style={styles.fieldRowItem}>
                  <InputField label="SUBJECT" error={errors.subject?.message}>
                    <Controller
                      control={control}
                      name="subject"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          placeholder="e.g. Mathematics"
                          placeholderTextColor={colors.text.tertiary}
                          style={styles.input}
                        />
                      )}
                    />
                  </InputField>
                </View>
                <View style={styles.fieldRowItem}>
                  <InputField label="GRADE / CLASS" error={errors.gradeClass?.message}>
                    <Controller
                      control={control}
                      name="gradeClass"
                      render={({ field: { value, onChange, onBlur } }) => (
                        <TextInput
                          value={value}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          placeholder="e.g. Grade 8 - Section A"
                          placeholderTextColor={colors.text.tertiary}
                          style={styles.input}
                        />
                      )}
                    />
                  </InputField>
                </View>
              </View>

              {/* Topic */}
              <InputField label="TOPIC" error={errors.topic?.message}>
                <Controller
                  control={control}
                  name="topic"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="e.g. Fractions and Decimals"
                      placeholderTextColor={colors.text.tertiary}
                      style={styles.input}
                    />
                  )}
                />
              </InputField>

              {/* Language */}
              <InputField label="INSTRUCTION LANGUAGE" error={errors.language?.message}>
                <View style={styles.languageChips}>
                  {QUICK_LANGUAGES.map((lang) => {
                    const selected = selectedLanguage.trim().toLowerCase() === lang.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={lang}
                        activeOpacity={0.8}
                        onPress={() => setValue("language", lang)}
                        style={[styles.languageChip, selected && styles.languageChipActive]}
                      >
                        <Text style={[styles.languageChipText, selected && styles.languageChipTextActive]}>
                          {lang}
                          {selected ? " ✓" : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity style={styles.languageChip} activeOpacity={0.8}>
                    <Text style={styles.languageChipText}>+ More</Text>
                  </TouchableOpacity>
                </View>
              </InputField>

              {/* Lost Threshold */}
              <InputField label="ALERT SENSITIVITY" hint="How sensitive should alerts be when students seem confused?">
                <Controller
                  control={control}
                  name="lostThreshold"
                  render={({ field: { value, onChange } }) => (
                    <View style={styles.sliderContainer}>
                      <View style={styles.sliderRow}>
                        <View style={styles.sliderTrackWrap}>
                          <Slider
                            value={value}
                            onValueChange={(nextValue) => onChange(Math.round(nextValue))}
                            minimumValue={10}
                            maximumValue={90}
                            step={1}
                            minimumTrackTintColor={colors.primary[500]}
                            maximumTrackTintColor={colors.surface.border}
                            thumbTintColor={colors.primary[600]}
                          />
                          <View style={styles.sliderLabels}>
                            <Text style={styles.sliderLabelText}>Low (Passive)</Text>
                            <Text style={styles.sliderLabelText}>High (Aggressive)</Text>
                          </View>
                        </View>
                        <View style={styles.thresholdBadge}>
                          <Text style={styles.thresholdValue}>{Math.round(value)}%</Text>
                        </View>
                      </View>
                    </View>
                  )}
                />
              </InputField>

              {/* Lesson Plan Seed */}
              <InputField
                label="LESSON NOTES (OPTIONAL)"
                error={errors.lessonPlanSeed?.message}
              >
                <Controller
                  control={control}
                  name="lessonPlanSeed"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="Paste your lesson notes or key points for AI to focus on..."
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

              {/* Bottom actions */}
              <View style={styles.bottomActions}>
                <TouchableOpacity style={styles.saveDraftButton} activeOpacity={0.7}>
                  <Text style={styles.saveDraftText}>💾  Save as Draft</Text>
                </TouchableOpacity>
                <Button
                  title="Launch Session"
                  onPress={onSubmit}
                  loading={isSubmitting}
                  size="lg"
                  style={styles.launchButton}
                />
              </View>
            </Card>

          </View>

          {isHydrating ? (
            <Text style={styles.footerText}>Restoring saved session state…</Text>
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
    alignItems: "center",
  },

  // Form wrapper
  formWrapper: {
    width: "100%",
    maxWidth: 860,
    gap: spacing.lg,
  },
  formCard: {
    ...shadows.lg,
    borderRadius: borderRadius["3xl"],
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  formTitle: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: "row",
    backgroundColor: colors.surface.backgroundAlt,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  modeOption: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  modeOptionSelected: {
    backgroundColor: colors.surface.card,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  modeLabel: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  modeLabelSelected: {
    color: colors.text.primary,
  },
  modeDescription: {
    display: "none",
  },
  modeDescriptionSelected: {},

  // Resume banner
  resumeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.lg,
    gap: spacing.base,
  },
  resumeContent: {
    flex: 1,
  },
  resumeTitle: {
    ...textStyles.bodyMedium,
    color: colors.primary[700],
    fontWeight: "600",
  },
  resumeText: {
    ...textStyles.bodySmall,
    color: colors.primary[600],
    marginTop: spacing.xxs,
  },

  // Fields
  fieldRow: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  fieldRowItem: {
    flex: 1,
  },
  fieldGroup: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 1,
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
    borderWidth: 0,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.backgroundAlt,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    ...textStyles.bodyMedium,
  },
  textArea: {
    minHeight: 100,
    paddingTop: spacing.base,
  },

  // Language chips
  languageChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  languageChip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface.backgroundAlt,
  },
  languageChipActive: {
    backgroundColor: colors.primary[600],
  },
  languageChipText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  languageChipTextActive: {
    color: colors.text.inverse,
  },

  // Slider
  sliderContainer: {},
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  sliderTrackWrap: {
    flex: 1,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  sliderLabelText: {
    ...textStyles.caption,
    color: colors.text.tertiary,
  },
  thresholdBadge: {
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    minWidth: 64,
    alignItems: "center",
  },
  thresholdValue: {
    ...textStyles.headingSmall,
    color: colors.primary[700],
  },

  // Bottom actions
  bottomActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.lg,
    gap: spacing.base,
  },
  saveDraftButton: {
    paddingVertical: spacing.md,
  },
  saveDraftText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  launchButton: {
    paddingHorizontal: spacing["3xl"],
    borderRadius: borderRadius.xl,
  },

  // Error
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


  footerText: {
    ...textStyles.bodySmall,
    color: colors.text.tertiary,
    marginTop: spacing.lg,
  },
});
