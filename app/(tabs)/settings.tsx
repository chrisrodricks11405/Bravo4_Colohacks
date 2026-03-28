import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StateScreen } from "../../src/components/app/StateScreen";
import { Badge, Button, Card } from "../../src/components/ui";
import { useAuth } from "../../src/providers";
import {
  saveTeacherPreferences,
  voiceProvider,
  VOICE_LOCALE_OPTIONS,
  VOICE_TTS_OPTIONS,
} from "../../src/services";
import { useNetworkStore, usePreferencesStore } from "../../src/stores";
import { useShallow } from "zustand/react/shallow";
import { DEFAULT_PREFERENCES, type TeacherPreferences } from "../../src/types";
import { borderRadius, colors, spacing, textStyles } from "../../src/theme";

const COMMON_LANGUAGES = ["English", "Hindi", "Marathi", "Kannada"];

interface SettingsDraft {
  defaultSubject: string;
  defaultGradeClass: string;
  defaultLanguage: string;
  defaultLostThreshold: string;
  voiceEnabled: boolean;
  ttsVoice: string;
  ttsLocale: string;
  aiProviderEnabled: boolean;
}

function toDraft(preferences: Partial<TeacherPreferences>): SettingsDraft {
  return {
    defaultSubject: preferences.defaultSubject ?? "",
    defaultGradeClass: preferences.defaultGradeClass ?? "",
    defaultLanguage: preferences.defaultLanguage ?? DEFAULT_PREFERENCES.defaultLanguage,
    defaultLostThreshold: String(
      preferences.defaultLostThreshold ?? DEFAULT_PREFERENCES.defaultLostThreshold
    ),
    voiceEnabled: preferences.voiceEnabled ?? DEFAULT_PREFERENCES.voiceEnabled,
    ttsVoice: preferences.ttsVoice ?? DEFAULT_PREFERENCES.ttsVoice ?? "marin",
    ttsLocale: preferences.ttsLocale ?? DEFAULT_PREFERENCES.ttsLocale ?? "en-US",
    aiProviderEnabled:
      preferences.aiProviderEnabled ?? DEFAULT_PREFERENCES.aiProviderEnabled,
  };
}

function normalizeDraft(
  draft: SettingsDraft,
  existingPreferences: TeacherPreferences
): TeacherPreferences {
  const parsedThreshold = Number(draft.defaultLostThreshold);
  const lostThreshold = Number.isFinite(parsedThreshold)
    ? Math.max(0, Math.min(100, parsedThreshold))
    : DEFAULT_PREFERENCES.defaultLostThreshold;

  return {
    ...existingPreferences,
    defaultSubject: draft.defaultSubject.trim() || undefined,
    defaultGradeClass: draft.defaultGradeClass.trim() || undefined,
    defaultLanguage: draft.defaultLanguage.trim() || DEFAULT_PREFERENCES.defaultLanguage,
    defaultLostThreshold: lostThreshold,
    voiceEnabled: draft.voiceEnabled,
    ttsVoice: draft.ttsVoice.trim() || DEFAULT_PREFERENCES.ttsVoice,
    ttsLocale: draft.ttsLocale.trim() || DEFAULT_PREFERENCES.ttsLocale,
    aiProviderEnabled: draft.aiProviderEnabled,
  };
}

function formatVoiceLabel(voice: string) {
  return voice.charAt(0).toUpperCase() + voice.slice(1);
}

function TextField({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.tertiary}
        style={styles.input}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const voiceServiceReachable = useNetworkStore((state) => state.voiceServiceReachable);
  const preferences = usePreferencesStore(useShallow((state) => ({
    defaultSubject: state.defaultSubject,
    defaultGradeClass: state.defaultGradeClass,
    defaultLanguage: state.defaultLanguage,
    defaultLostThreshold: state.defaultLostThreshold,
    voiceEnabled: state.voiceEnabled,
    ttsVoice: state.ttsVoice,
    ttsLocale: state.ttsLocale,
    aiProviderEnabled: state.aiProviderEnabled,
    theme: state.theme,
    isLoaded: state.isLoaded,
    loadPreferences: state.loadPreferences,
  })));
  const [draft, setDraft] = useState<SettingsDraft>(toDraft(preferences));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const voiceCapabilities = voiceProvider.getCapabilities();

  useEffect(() => {
    if (!preferences.isLoaded) {
      return;
    }

    setDraft(
      toDraft({
        defaultSubject: preferences.defaultSubject,
        defaultGradeClass: preferences.defaultGradeClass,
        defaultLanguage: preferences.defaultLanguage,
        defaultLostThreshold: preferences.defaultLostThreshold,
        voiceEnabled: preferences.voiceEnabled,
        ttsVoice: preferences.ttsVoice,
        ttsLocale: preferences.ttsLocale,
        aiProviderEnabled: preferences.aiProviderEnabled,
      })
    );
  }, [
    preferences.aiProviderEnabled,
    preferences.defaultGradeClass,
    preferences.defaultLanguage,
    preferences.defaultLostThreshold,
    preferences.defaultSubject,
    preferences.isLoaded,
    preferences.ttsLocale,
    preferences.ttsVoice,
    preferences.voiceEnabled,
  ]);

  if (!preferences.isLoaded) {
    return (
      <StateScreen
        title="Loading settings"
        message="Reading teacher preferences from local storage."
        loading
      />
    );
  }

  const normalizedCurrent = normalizeDraft(
    toDraft({
      defaultSubject: preferences.defaultSubject,
      defaultGradeClass: preferences.defaultGradeClass,
      defaultLanguage: preferences.defaultLanguage,
      defaultLostThreshold: preferences.defaultLostThreshold,
      voiceEnabled: preferences.voiceEnabled,
      ttsVoice: preferences.ttsVoice,
      ttsLocale: preferences.ttsLocale,
      aiProviderEnabled: preferences.aiProviderEnabled,
    }),
    {
      defaultSubject: preferences.defaultSubject,
      defaultGradeClass: preferences.defaultGradeClass,
      defaultLanguage: preferences.defaultLanguage,
      defaultLostThreshold: preferences.defaultLostThreshold,
      voiceEnabled: preferences.voiceEnabled,
      aiProviderEnabled: preferences.aiProviderEnabled,
      theme: preferences.theme,
      ttsVoice: preferences.ttsVoice,
      ttsLocale: preferences.ttsLocale,
    }
  );

  const normalizedDraft = normalizeDraft(draft, normalizedCurrent);
  const hasChanges =
    JSON.stringify(normalizedDraft) !== JSON.stringify(normalizedCurrent);

  const handleSave = async () => {
    setSaveState("saving");
    setSaveMessage(null);

    try {
      await saveTeacherPreferences(normalizedDraft);
      preferences.loadPreferences(normalizedDraft);
      setDraft(toDraft(normalizedDraft));
      setSaveState("saved");
      setSaveMessage("Preferences saved to local SQLite.");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "We could not save your preferences."
      );
    }
  };

  const handleReset = async () => {
    const resetPreferences: TeacherPreferences = {
      ...DEFAULT_PREFERENCES,
      theme: preferences.theme,
    };

    setSaveState("saving");
    setSaveMessage(null);

    try {
      await saveTeacherPreferences(resetPreferences);
      preferences.loadPreferences(resetPreferences);
      setDraft(toDraft(resetPreferences));
      setSaveState("saved");
      setSaveMessage("Teacher defaults restored.");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "We could not reset preferences."
      );
    }
  };

  const handleSignOut = async () => {
    setSaveState("saving");
    setSaveMessage("Signing out…");

    try {
      await signOut();
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "We could not sign you out."
      );
    }
  };

  const voiceStatus =
    !draft.voiceEnabled
      ? { label: "Voice off", variant: "neutral" as const }
      : voiceCapabilities.available && voiceServiceReachable
        ? { label: "Provider ready", variant: "success" as const }
        : voiceCapabilities.available
          ? { label: "Provider offline", variant: "warning" as const }
          : { label: "Provider unavailable", variant: "neutral" as const };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Teacher preferences and classroom defaults</Text>

        <View style={styles.topBar}>
          <Badge
            label={
              saveState === "saving"
                ? "Saving"
                : saveState === "saved"
                  ? "Saved"
                  : hasChanges
                    ? "Unsaved changes"
                    : "Up to date"
            }
            variant={
              saveState === "error"
                ? "error"
                : saveState === "saved"
                  ? "success"
                  : hasChanges
                    ? "warning"
                    : "neutral"
            }
            size="md"
          />
          <View style={styles.topBarActions}>
            <Button
              title="Reset"
              onPress={handleReset}
              variant="outline"
              size="sm"
              disabled={saveState === "saving"}
            />
            <Button
              title="Save Settings"
              onPress={handleSave}
              size="sm"
              loading={saveState === "saving"}
              disabled={!hasChanges}
            />
          </View>
        </View>

        {saveMessage ? (
          <View
            style={[
              styles.feedbackBox,
              saveState === "error" ? styles.feedbackError : styles.feedbackSuccess,
            ]}
          >
            <Text
              style={[
                styles.feedbackText,
                saveState === "error" ? styles.feedbackErrorText : styles.feedbackSuccessText,
              ]}
            >
              {saveMessage}
            </Text>
          </View>
        ) : null}

        <Card variant="default" padding="lg" style={styles.card}>
          <Text style={styles.cardTitle}>Session Defaults</Text>
          <Text style={styles.cardSubtitle}>
            These values prefill session setup and power the home screen CTA.
          </Text>

          <TextField
            label="Default Subject"
            value={draft.defaultSubject}
            placeholder="Science"
            onChangeText={(value) =>
              setDraft((current) => ({ ...current, defaultSubject: value }))
            }
          />
          <TextField
            label="Grade / Class"
            value={draft.defaultGradeClass}
            placeholder="Grade 8 A"
            onChangeText={(value) =>
              setDraft((current) => ({ ...current, defaultGradeClass: value }))
            }
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Default Language</Text>
            <View style={styles.languageRow}>
              {COMMON_LANGUAGES.map((language) => {
                const selected =
                  draft.defaultLanguage.trim().toLowerCase() === language.toLowerCase();

                return (
                  <TouchableOpacity
                    key={language}
                    activeOpacity={0.8}
                    onPress={() =>
                      setDraft((current) => ({ ...current, defaultLanguage: language }))
                    }
                    style={[
                      styles.languageChip,
                      selected && styles.languageChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.languageChipText,
                        selected && styles.languageChipTextActive,
                      ]}
                    >
                      {language}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={draft.defaultLanguage}
              onChangeText={(value) =>
                setDraft((current) => ({ ...current, defaultLanguage: value }))
              }
              placeholder="Or type a custom language"
              placeholderTextColor={colors.text.tertiary}
              style={styles.input}
            />
          </View>

          <TextField
            label="Lost Threshold Default"
            value={draft.defaultLostThreshold}
            placeholder="40"
            keyboardType="numeric"
            onChangeText={(value) =>
              setDraft((current) => ({ ...current, defaultLostThreshold: value }))
            }
          />
          <Text style={styles.helperText}>
            Used as the default threshold for intervention prompts. Valid range: 0 to 100.
          </Text>
        </Card>

        <Card variant="default" padding="lg" style={styles.card}>
          <Text style={styles.cardTitle}>AI & Voice</Text>
          <Text style={styles.cardSubtitle}>
            Control AI assistance, speech settings, and graceful fallbacks across the teacher app.
          </Text>

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>AI Provider</Text>
              <Text style={styles.toggleDescription}>
                Enable AI coaching badges and future insight generation.
              </Text>
            </View>
            <Switch
              value={draft.aiProviderEnabled}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, aiProviderEnabled: value }))
              }
              trackColor={{ false: colors.surface.border, true: colors.primary[300] }}
              thumbColor={
                draft.aiProviderEnabled ? colors.primary[600] : colors.surface.card
              }
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Voice Features</Text>
              <Text style={styles.toggleDescription}>
                Enable voice-to-poll, spoken explanations, and post-session reflections when the provider is available.
              </Text>
            </View>
            <Switch
              value={draft.voiceEnabled}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, voiceEnabled: value }))
              }
              trackColor={{ false: colors.surface.border, true: colors.primary[300] }}
              thumbColor={
                draft.voiceEnabled ? colors.primary[600] : colors.surface.card
              }
            />
          </View>

          <View style={styles.voiceStatusCard}>
            <View style={styles.voiceStatusHeader}>
              <View>
                <Text style={styles.toggleTitle}>Voice provider status</Text>
                <Text style={styles.toggleDescription}>
                  Voice controls automatically hide when transcription or TTS is unavailable.
                </Text>
              </View>
              <Badge label={voiceStatus.label} variant={voiceStatus.variant} size="sm" />
            </View>
            {!voiceCapabilities.available ? (
              <Text style={styles.voiceStatusText}>
                {voiceCapabilities.reason ??
                  "Connect a configured voice provider to enable recording and spoken playback."}
              </Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>TTS Voice</Text>
            <View style={styles.languageRow}>
              {VOICE_TTS_OPTIONS.map((voice) => {
                const selected = draft.ttsVoice === voice;

                return (
                  <TouchableOpacity
                    key={voice}
                    activeOpacity={0.8}
                    onPress={() =>
                      setDraft((current) => ({ ...current, ttsVoice: voice }))
                    }
                    style={[
                      styles.languageChip,
                      selected && styles.languageChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.languageChipText,
                        selected && styles.languageChipTextActive,
                      ]}
                    >
                      {formatVoiceLabel(voice)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Speech Language</Text>
            <View style={styles.languageRow}>
              {VOICE_LOCALE_OPTIONS.map((localeOption) => {
                const selected = draft.ttsLocale === localeOption.value;

                return (
                  <TouchableOpacity
                    key={localeOption.value}
                    activeOpacity={0.8}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        ttsLocale: localeOption.value,
                      }))
                    }
                    style={[
                      styles.languageChip,
                      selected && styles.languageChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.languageChipText,
                        selected && styles.languageChipTextActive,
                      ]}
                    >
                      {localeOption.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={draft.ttsLocale}
              onChangeText={(value) =>
                setDraft((current) => ({ ...current, ttsLocale: value }))
              }
              placeholder="Or type a custom locale like en-GB"
              placeholderTextColor={colors.text.tertiary}
              style={styles.input}
            />
          </View>
        </Card>

        <Card variant="default" padding="lg" style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Signed in as</Text>
            <Text style={styles.accountValue}>{user?.email ?? "Unknown teacher"}</Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>App</Text>
            <Text style={styles.accountValue}>ClassPulse AI Teacher 1.0.0</Text>
          </View>
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="danger"
            size="md"
            style={styles.signOutButton}
          />
        </Card>
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
    paddingBottom: spacing["3xl"],
  },
  title: {
    ...textStyles.displayMedium,
    color: colors.text.primary,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
    marginBottom: spacing.xl,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.base,
    marginBottom: spacing.base,
  },
  topBarActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  feedbackBox: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  feedbackError: {
    backgroundColor: colors.status.errorBg,
  },
  feedbackSuccess: {
    backgroundColor: colors.status.successBg,
  },
  feedbackText: {
    ...textStyles.bodySmall,
  },
  feedbackErrorText: {
    color: "#991B1B",
  },
  feedbackSuccessText: {
    color: "#065F46",
  },
  card: {
    marginBottom: spacing.base,
  },
  cardTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },
  cardSubtitle: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.base,
  },
  fieldLabel: {
    ...textStyles.label,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.background,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    ...textStyles.bodyMedium,
  },
  languageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  languageChip: {
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface.background,
  },
  languageChipActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  languageChipText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  languageChipTextActive: {
    color: colors.primary[700],
  },
  helperText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: -spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surface.borderLight,
  },
  voiceStatusCard: {
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.cardHover,
    gap: spacing.sm,
  },
  voiceStatusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.base,
    alignItems: "flex-start",
  },
  voiceStatusText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleTitle: {
    ...textStyles.bodyLarge,
    color: colors.text.primary,
    fontWeight: "600",
  },
  toggleDescription: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginTop: spacing.xxs,
  },
  accountRow: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surface.borderLight,
  },
  accountLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    marginBottom: spacing.xxs,
  },
  accountValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "600",
  },
  signOutButton: {
    marginTop: spacing.lg,
  },
});
