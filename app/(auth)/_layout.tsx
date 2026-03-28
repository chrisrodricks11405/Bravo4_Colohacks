import React from "react";
import { Redirect, Stack } from "expo-router";
import { StateScreen } from "../../src/components/app/StateScreen";
import { useAuth } from "../../src/providers";
import { colors } from "../../src/theme";

export default function AuthLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <StateScreen
        title="Checking sign-in status"
        message="One moment while we restore your teacher session."
        tone="dark"
        loading
      />
    );
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.dark.background },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="callback" />
    </Stack>
  );
}
