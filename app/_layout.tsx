import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";
import { AppErrorBoundary } from "../src/components/app/AppErrorBoundary";
import { AppRuntimeObserver } from "../src/components/app/AppRuntimeObserver";
import { ConnectivityBanner } from "../src/components/app/ConnectivityBanner";
import { initializeMonitoring, Sentry } from "../src/lib/monitoring";
import {
  NetworkProvider,
  DatabaseProvider,
  QueryProvider,
  AuthProvider,
  PreferencesProvider,
  SessionProvider,
  SyncProvider,
} from "../src/providers";
import { colors } from "../src/theme";

initializeMonitoring();

function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryProvider>
          <DatabaseProvider>
            <AuthProvider>
              <PreferencesProvider>
                <SessionProvider>
                  <NetworkProvider>
                    <SyncProvider>
                      <AppErrorBoundary>
                        <StatusBar style="light" />
                        <AppRuntimeObserver />
                        <Stack
                          screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: colors.surface.background },
                            animation: "slide_from_right",
                          }}
                        >
                          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                          <Stack.Screen
                            name="session"
                            options={{ headerShown: false, animation: "slide_from_bottom" }}
                          />
                        </Stack>
                        <ConnectivityBanner />
                      </AppErrorBoundary>
                    </SyncProvider>
                  </NetworkProvider>
                </SessionProvider>
              </PreferencesProvider>
            </AuthProvider>
          </DatabaseProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default Sentry.wrap(RootLayout);
