import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Badge, Button, Card } from "../../src/components/ui";
import { useAuth } from "../../src/providers";
import { borderRadius, colors, shadows, spacing, textStyles } from "../../src/theme";

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, isConfigured } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!isConfigured) {
      setErrorMessage("Add valid Supabase environment variables before signing up.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setIsSigningUp(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await signUp(email, password);
      setSuccessMessage(
        "Account created! Check your email to confirm, then sign in."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Sign-up failed. Please try again."
      );
    } finally {
      setIsSigningUp(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <View style={styles.brandPanel}>
            <Badge label="Teacher Workspace" variant="primary" size="md" style={styles.brandBadge} />
            <Text style={styles.title}>ClassPulse AI</Text>
            <Text style={styles.subtitle}>
              Create your teacher account to start running live classroom sessions with real-time AI insights.
            </Text>

            <View style={styles.highlights}>
              <View style={styles.highlightItem}>
                <Text style={styles.highlightTitle}>Real-time engagement</Text>
                <Text style={styles.highlightText}>
                  Monitor student understanding with live pulse checks, polls, and AI-powered question clustering.
                </Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={styles.highlightTitle}>AI-powered insights</Text>
                <Text style={styles.highlightText}>
                  Get automatic session summaries, misconception detection, and intervention suggestions.
                </Text>
              </View>
            </View>
          </View>

          <Card variant="default" padding="lg" style={styles.formCard}>
            <Text style={styles.formTitle}>Create account</Text>
            <Text style={styles.formSubtitle}>
              Sign up with your email and password.
            </Text>

            {!isConfigured ? (
              <View style={styles.notice}>
                <Badge label="Supabase setup required" variant="warning" size="md" />
                <Text style={styles.noticeText}>
                  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are still using placeholders.
                </Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {successMessage ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="teacher@school.org"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.text.tertiary}
                secureTextEntry
                style={styles.input}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your password"
                placeholderTextColor={colors.text.tertiary}
                secureTextEntry
                style={styles.input}
              />
            </View>

            <View style={styles.buttonStack}>
              <Button
                title="Create Account"
                onPress={handleSignUp}
                loading={isSigningUp}
                disabled={!email.trim() || !password || !confirmPassword}
                size="lg"
                fullWidth
              />
            </View>

            <TouchableOpacity
              onPress={() => router.replace("/(auth)/login")}
              style={styles.switchLink}
            >
              <Text style={styles.switchText}>
                Already have an account? <Text style={styles.switchTextBold}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    flexDirection: "row",
    gap: spacing.xl,
  },
  brandPanel: {
    flex: 1.15,
    justifyContent: "center",
    paddingRight: spacing.xl,
  },
  brandBadge: {
    alignSelf: "flex-start",
    marginBottom: spacing.lg,
  },
  title: {
    ...textStyles.displayLarge,
    color: colors.text.inverse,
    marginBottom: spacing.base,
  },
  subtitle: {
    ...textStyles.bodyLarge,
    color: colors.dark.textSecondary,
    maxWidth: 520,
  },
  highlights: {
    marginTop: spacing["2xl"],
    gap: spacing.base,
  },
  highlightItem: {
    backgroundColor: colors.dark.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.dark.surfaceLight,
  },
  highlightTitle: {
    ...textStyles.headingSmall,
    color: colors.text.inverse,
    marginBottom: spacing.xs,
  },
  highlightText: {
    ...textStyles.bodyMedium,
    color: colors.dark.textSecondary,
  },
  formCard: {
    flex: 0.95,
    alignSelf: "center",
    width: "100%",
    maxWidth: 500,
    backgroundColor: colors.surface.card,
    ...shadows.lg,
  },
  formTitle: {
    ...textStyles.headingLarge,
    color: colors.text.primary,
  },
  formSubtitle: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  notice: {
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  noticeText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
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
  successBox: {
    backgroundColor: colors.status.successBg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  successText: {
    ...textStyles.bodySmall,
    color: "#065F46",
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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface.background,
    color: colors.text.primary,
    ...textStyles.bodyMedium,
  },
  buttonStack: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  switchLink: {
    alignItems: "center",
    marginTop: spacing.lg,
  },
  switchText: {
    ...textStyles.bodyMedium,
    color: colors.text.secondary,
  },
  switchTextBold: {
    color: colors.primary[600],
    fontWeight: "600",
  },
});
