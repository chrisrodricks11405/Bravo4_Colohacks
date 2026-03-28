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

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionIcon}>{icon}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
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
    if (!preferences.isLoaded) return;
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
    preferences.aiProviderEnabled, preferences.defaultGradeClass,
    preferences.defaultLanguage, preferences.defaultLostThreshold,
    preferences.defaultSubject, preferences.isLoaded,
    preferences.ttsLocale, preferences.ttsVoice, preferences.voiceEnabled,
  ]);

  if (!preferences.isLoaded) {
    return <StateScreen title="Loading settings" message="Reading teacher preferences." loading />;
  }

  const normalizedCurrent = normalizeDraft(toDraft({
    defaultSubject: preferences.defaultSubject, defaultGradeClass: preferences.defaultGradeClass,
    defaultLanguage: preferences.defaultLanguage, defaultLostThreshold: preferences.defaultLostThreshold,
    voiceEnabled: preferences.voiceEnabled, ttsVoice: preferences.ttsVoice,
    ttsLocale: preferences.ttsLocale, aiProviderEnabled: preferences.aiProviderEnabled,
  }), {
    defaultSubject: preferences.defaultSubject, defaultGradeClass: preferences.defaultGradeClass,
    defaultLanguage: preferences.defaultLanguage, defaultLostThreshold: preferences.defaultLostThreshold,
    voiceEnabled: preferences.voiceEnabled, aiProviderEnabled: preferences.aiProviderEnabled,
    theme: preferences.theme, ttsVoice: preferences.ttsVoice, ttsLocale: preferences.ttsLocale,
  });

  const normalizedDraft = normalizeDraft(draft, normalizedCurrent);
  const hasChanges = JSON.stringify(normalizedDraft) !== JSON.stringify(normalizedCurrent);

  const handleSave = async () => {
    setSaveState("saving");
    setSaveMessage(null);
    try {
      await saveTeacherPreferences(normalizedDraft);
      preferences.loadPreferences(normalizedDraft);
      setDraft(toDraft(normalizedDraft));
      setSaveState("saved");
      setSaveMessage("Preferences saved.");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Could not save.");
    }
  };

  const handleReset = async () => {
    const resetPreferences: TeacherPreferences = { ...DEFAULT_PREFERENCES, theme: preferences.theme };
    setSaveState("saving");
    setSaveMessage(null);
    try {
      await saveTeacherPreferences(resetPreferences);
      preferences.loadPreferences(resetPreferences);
      setDraft(toDraft(resetPreferences));
      setSaveState("saved");
      setSaveMessage("Defaults restored.");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Could not reset.");
    }
  };

  const handleSignOut = async () => {
    setSaveState("saving");
    setSaveMessage("Signing out…");
    try { await signOut(); } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "Could not sign out.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Top action bar */}
        <View style={styles.topBar}>
          <Badge
            label={
              saveState === "saving" ? "Saving…"
                : saveState === "saved" ? "Up to date"
                : hasChanges ? "Unsaved changes"
                : "Up to date"
            }
            variant={saveState === "error" ? "error" : saveState === "saved" ? "success" : hasChanges ? "warning" : "neutral"}
            size="md"
            dot
          />
          <View style={styles.topBarActions}>
            <Button title="Reset" onPress={handleReset} variant="ghost" size="sm" disabled={saveState === "saving"} />
            <Button title="Save Settings" onPress={handleSave} size="sm" loading={saveState === "saving"} disabled={!hasChanges} />
          </View>
        </View>

        <Text style={styles.pageTitle}>Settings</Text>
        <Text style={styles.pageSubtitle}>Configure your classroom AI preferences and account.</Text>

        {saveMessage ? (
          <View style={[styles.feedbackBox, saveState === "error" ? styles.feedbackError : styles.feedbackSuccess]}>
            <Text style={[styles.feedbackText, saveState === "error" ? styles.feedbackErrorText : styles.feedbackSuccessText]}>
              {saveMessage}
            </Text>
          </View>
        ) : null}

        {/* Session Defaults */}
        <Card variant="tonal" padding="lg" style={styles.card}>
          <SectionHeader title="Session Defaults" icon="📋" />

          <FieldLabel label="DEFAULT SUBJECT" />
          <TextInput
            value={draft.defaultSubject}
            onChangeText={(v) => setDraft((c) => ({ ...c, defaultSubject: v }))}
            placeholder="Mathematics"
            placeholderTextColor={colors.text.tertiary}
            style={styles.input}
          />

          <FieldLabel label="GRADE LEVEL" />
          <View style={styles.chipRow}>
            {["Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"].map((grade) => {
              const selected = draft.defaultGradeClass.trim() === grade;
              return (
                <TouchableOpacity
                  key={grade}
                  activeOpacity={0.8}
                  onPress={() => setDraft((c) => ({ ...c, defaultGradeClass: grade }))}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{grade.replace("Grade ", "Grade ")}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldRowItem}>
              <FieldLabel label="DEFAULT LANGUAGE" />
              <View style={styles.chipRow}>
                {COMMON_LANGUAGES.map((lang) => {
                  const selected = draft.defaultLanguage.trim().toLowerCase() === lang.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={lang}
                      activeOpacity={0.8}
                      onPress={() => setDraft((c) => ({ ...c, defaultLanguage: lang }))}
                      style={[styles.chip, selected && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {selected ? `🌐 ${lang}` : lang}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View style={styles.fieldRowItem}>
              <FieldLabel label="LOST THRESHOLD (MIN)" />
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setDraft((c) => ({
                    ...c,
                    defaultLostThreshold: String(Math.max(0, Number(c.defaultLostThreshold) - 1)),
                  }))}
                >
                  <Text style={styles.stepperButtonText}>—</Text>
                </TouchableOpacity>
                <TextInput
                  value={draft.defaultLostThreshold}
                  onChangeText={(v) => setDraft((c) => ({ ...c, defaultLostThreshold: v }))}
                  keyboardType="numeric"
                  style={styles.stepperInput}
                />
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setDraft((c) => ({
                    ...c,
                    defaultLostThreshold: String(Math.min(100, Number(c.defaultLostThreshold) + 1)),
                  }))}
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Card>

        {/* AI & Voice */}
        <Card variant="tonal" padding="lg" style={styles.card}>
          <SectionHeader title="AI & Voice" icon="🤖" />

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>AI Provider Premium</Text>
              <Text style={styles.toggleDescription}>Use advanced LLM for deeper student sentiment analysis</Text>
            </View>
            <Switch
              value={draft.aiProviderEnabled}
              onValueChange={(v) => setDraft((c) => ({ ...c, aiProviderEnabled: v }))}
              trackColor={{ false: colors.surface.border, true: colors.primary[300] }}
              thumbColor={draft.aiProviderEnabled ? colors.primary[600] : colors.surface.card}
            />
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Voice Recognition</Text>
              <Text style={styles.toggleDescription}>Enable real-time transcription and speaker identification</Text>
            </View>
            <Switch
              value={draft.voiceEnabled}
              onValueChange={(v) => setDraft((c) => ({ ...c, voiceEnabled: v }))}
              trackColor={{ false: colors.surface.border, true: colors.primary[300] }}
              thumbColor={draft.voiceEnabled ? colors.primary[600] : colors.surface.card}
            />
          </View>

          {draft.voiceEnabled && (
            <>
              <View style={styles.voiceSettings}>
                <FieldLabel label="TTS VOICE" />
                <View style={styles.chipRow}>
                  {VOICE_TTS_OPTIONS.map((voice) => {
                    const selected = draft.ttsVoice === voice;
                    return (
                      <TouchableOpacity
                        key={voice}
                        activeOpacity={0.8}
                        onPress={() => setDraft((c) => ({ ...c, ttsVoice: voice }))}
                        style={[styles.chip, selected && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>{formatVoiceLabel(voice)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <FieldLabel label="SPEECH LANGUAGE" />
                <View style={styles.chipRow}>
                  {VOICE_LOCALE_OPTIONS.map((opt) => {
                    const selected = draft.ttsLocale === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        activeOpacity={0.8}
                        onPress={() => setDraft((c) => ({ ...c, ttsLocale: opt.value }))}
                        style={[styles.chip, selected && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </Card>

        {/* Account */}
        <Card variant="tonal" padding="lg" style={styles.card}>
          <SectionHeader title="Account" icon="👤" />

          <View style={styles.accountCard}>
            <View style={styles.accountAvatar}>
              <Text style={styles.accountAvatarText}>
                {(user?.email ?? "T").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.accountLabel}>Signed in as</Text>
              <Text style={styles.accountEmail}>{user?.email ?? "Unknown"}</Text>
            </View>
          </View>

          <View style={styles.accountRow}>
            <Text style={styles.accountRowLabel}>APP VERSION</Text>
            <Text style={styles.accountRowValue}>v2.4.0 (Build 892)</Text>
          </View>

          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="danger"
            size="md"
            style={styles.signOutButton}
            icon={<Text style={{ color: colors.text.inverse, fontSize: 14 }}>↗</Text>}
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
    maxWidth: 780,
    alignSelf: "center",
    width: "100%",
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  topBarActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },

  pageTitle: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },
  pageSubtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },

  // Feedback
  feedbackBox: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  feedbackError: { backgroundColor: colors.status.errorBg },
  feedbackSuccess: { backgroundColor: colors.status.successBg },
  feedbackText: { ...textStyles.bodySmall },
  feedbackErrorText: { color: "#991B1B" },
  feedbackSuccessText: { color: "#065F46" },

  // Cards
  card: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius["2xl"],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    ...textStyles.headingSmall,
    color: colors.text.primary,
  },

  // Fields
  fieldLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  input: {
    minHeight: 52,
    borderWidth: 0,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    color: colors.text.primary,
    ...textStyles.bodyMedium,
  },
  fieldRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  fieldRowItem: {
    flex: 1,
  },

  // Chips
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface.card,
  },
  chipActive: {
    backgroundColor: colors.primary[600],
  },
  chipText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.text.inverse,
  },

  // Stepper
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.card,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  stepperButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: {
    ...textStyles.headingSmall,
    color: colors.text.secondary,
  },
  stepperInput: {
    flex: 1,
    textAlign: "center",
    ...textStyles.headingSmall,
    color: colors.text.primary,
    paddingVertical: spacing.md,
  },

  // Toggles
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.base,
    paddingVertical: spacing.base,
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
  voiceSettings: {
    marginTop: spacing.sm,
  },

  // Account
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface.card,
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  accountAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[100],
    alignItems: "center",
    justifyContent: "center",
  },
  accountAvatarText: {
    ...textStyles.headingSmall,
    color: colors.primary[700],
  },
  accountLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  accountEmail: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
    fontWeight: "600",
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  accountRowLabel: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  accountRowValue: {
    ...textStyles.bodyMedium,
    color: colors.text.primary,
  },
  signOutButton: {
    alignSelf: "flex-end",
  },
});
