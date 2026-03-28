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
          {/* Left Branding Panel */}
          <View style={styles.brandPanel}>
            <View style={styles.brandTop}>
              <Text style={styles.brandIcon}>✦</Text>
              <Text style={styles.brandName}>ClassPulse AI</Text>
            </View>

            <View style={styles.brandCenter}>
              <Text style={styles.headline}>
                YOUR CLASSROOM{"\n"}RADAR, ALWAYS ON.
              </Text>

              <View style={styles.featurePills}>
                <View style={styles.featurePill}>
                  <View style={styles.featurePillIcon}>
                    <Text style={styles.featurePillIconText}>⚡</Text>
                  </View>
                  <Text style={styles.featurePillText}>Launch a session in one tap</Text>
                </View>
                <View style={styles.featurePill}>
                  <View style={[styles.featurePillIcon, styles.featurePillIconAlt]}>
                    <Text style={styles.featurePillIconText}>☁</Text>
                  </View>
                  <Text style={styles.featurePillText}>Your settings travel with you</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Right Form Panel */}
          <View style={styles.formPanel}>
            <View style={styles.formContainer}>
              <Card variant="elevated" padding="xl" style={styles.formCard}>
                <Text style={styles.formTitle}>Sign In</Text>
                <Text style={styles.formSubtitle}>Welcome back, teacher.</Text>

                {!isConfigured ? (
                  <View style={styles.notice}>
                    <Badge label="Supabase setup required" variant="warning" size="md" />
                    <Text style={styles.noticeText}>
                      Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env
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
                    placeholder="name@school.edu"
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

                <Button
                  title="Sign In"
                  onPress={handlePasswordSignIn}
                  loading={isSigningIn}
                  disabled={!email.trim() || !password}
                  size="lg"
                  fullWidth
                  style={styles.signInButton}
                />

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Button
                  title="Send Magic Link"
                  onPress={handleMagicLink}
                  loading={isSendingMagicLink}
                  disabled={!email.trim()}
                  variant="outline"
                  size="lg"
                  fullWidth
                />

                <TouchableOpacity
                  onPress={() => router.replace("/(auth)/signup")}
                  style={styles.switchLink}
                >
                  <Text style={styles.switchText}>
                    Don't have an account?{" "}
                    <Text style={styles.switchTextBold}>Sign up</Text>
                  </Text>
                </TouchableOpacity>
              </Card>
            </View>
          </View>
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
    flexDirection: "row",
  },

  // Left brand panel
  brandPanel: {
    flex: 1,
    paddingHorizontal: spacing["3xl"],
    paddingVertical: spacing["2xl"],
    justifyContent: "space-between",
  },
  brandTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brandIcon: {
    fontSize: 20,
    color: colors.primary[400],
  },
  brandName: {
    ...textStyles.bodyMedium,
    color: colors.text.inverse,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  brandCenter: {
    flex: 1,
    justifyContent: "center",
    maxWidth: 520,
  },
  headline: {
    fontSize: 42,
    fontWeight: "700",
    color: colors.text.inverse,
    lineHeight: 52,
    letterSpacing: -0.5,
    marginBottom: spacing["2xl"],
  },
  featurePills: {
    gap: spacing.md,
  },
  featurePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.lg,
  },
  featurePillIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: "rgba(108, 248, 187, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  featurePillIconAlt: {
    backgroundColor: "rgba(163, 180, 252, 0.15)",
  },
  featurePillIconText: {
    fontSize: 18,
  },
  featurePillText: {
    ...textStyles.bodyMedium,
    color: "rgba(255, 255, 255, 0.75)",
  },

  // Right form panel
  formPanel: {
    flex: 1,
    backgroundColor: colors.surface.background,
    borderTopLeftRadius: 32,
    borderBottomLeftRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["2xl"],
  },
  formContainer: {
    width: "100%",
    maxWidth: 440,
  },
  formCard: {
    ...shadows.xl,
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
    marginBottom: spacing.lg,
  },
  noticeText: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
  },
  errorBox: {
    backgroundColor: colors.status.errorBg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: "#991B1B",
  },
  successBox: {
    backgroundColor: colors.status.successBg,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  successText: {
    ...textStyles.bodySmall,
    color: "#065F46",
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    ...textStyles.bodySmall,
    color: colors.text.secondary,
    fontWeight: "500",
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 52,
    borderWidth: 0,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface.backgroundAlt,
    color: colors.text.primary,
    ...textStyles.bodyMedium,
  },
  signInButton: {
    marginTop: spacing.sm,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surface.border,
  },
  dividerText: {
    ...textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: "600",
    letterSpacing: 1,
  },
  switchLink: {
    alignItems: "center",
    marginTop: spacing.xl,
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
