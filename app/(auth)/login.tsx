import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Badge, Button, Card } from "../../src/components/ui";
import { useAuth } from "../../src/providers";
import { borderRadius, colors, shadows, spacing, textStyles } from "../../src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithPassword, sendMagicLink, isConfigured } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [magicLinkMessage, setMagicLinkMessage] = useState<string | null>(null);

  const handlePasswordSignIn = async () => {
    if (!isConfigured) {
      setErrorMessage("Add valid Supabase environment variables before signing in.");
      return;
    }

    setIsSigningIn(true);
    setErrorMessage(null);
    setMagicLinkMessage(null);

    try {
      await signInWithPassword(email, password);
      router.replace("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Sign-in failed. Please check your credentials."
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleMagicLink = async () => {
    if (!isConfigured) {
      setErrorMessage("Add valid Supabase environment variables before sending magic links.");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Enter your teacher email to receive a magic link.");
      return;
    }

    setIsSendingMagicLink(true);
    setErrorMessage(null);

    try {
      await sendMagicLink(email);
      setMagicLinkMessage(`Magic link sent to ${email.trim()}. Open it on this device to sign in.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We could not send a magic link right now."
      );
    } finally {
      setIsSendingMagicLink(false);
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
              Sign in with your Supabase teacher account and pick up where your last classroom left off.
            </Text>

            <View style={styles.highlights}>
              <View style={styles.highlightItem}>
                <Text style={styles.highlightTitle}>Fast classroom launch</Text>
                <Text style={styles.highlightText}>
                  Start live sessions, switch into offline mode, and review your synced recents from one home screen.
                </Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={styles.highlightTitle}>Settings travel with you</Text>
                <Text style={styles.highlightText}>
                  Default language, lost threshold, AI, and voice preferences are restored automatically.
                </Text>
              </View>
            </View>
          </View>

          <Card variant="default" padding="lg" style={styles.formCard}>
            <Text style={styles.formTitle}>Teacher sign in</Text>
            <Text style={styles.formSubtitle}>
              Use email and password, or send yourself a magic link.
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

            {magicLinkMessage ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{magicLinkMessage}</Text>
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
                placeholder="Enter your password"
                placeholderTextColor={colors.text.tertiary}
                secureTextEntry
                style={styles.input}
              />
            </View>

            <View style={styles.buttonStack}>
              <Button
                title="Sign In"
                onPress={handlePasswordSignIn}
                loading={isSigningIn}
                disabled={!email.trim() || !password}
                size="lg"
                fullWidth
              />
              <Button
                title="Send Magic Link"
                onPress={handleMagicLink}
                loading={isSendingMagicLink}
                disabled={!email.trim()}
                variant="outline"
                size="lg"
                fullWidth
              />
            </View>
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
});
