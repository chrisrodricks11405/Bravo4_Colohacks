import React from "react";
import { Redirect, Stack } from "expo-router";
import { StateScreen } from "../../src/components/app/StateScreen";
import { useAuth } from "../../src/providers";
import { colors } from "../../src/theme";

export default function SessionLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <StateScreen
        title="Preparing session tools"
        message="Checking access for your classroom workspace."
        loading
      />
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="create" />
      <Stack.Screen name="lobby" />
      <Stack.Screen name="live" />
      <Stack.Screen name="summary" />
    </Stack>
  );
}
