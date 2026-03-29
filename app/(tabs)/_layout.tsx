import React from "react";
import { Redirect, Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { StateScreen } from "../../src/components/app/StateScreen";
import { useAuth } from "../../src/providers";
import { colors, spacing, textStyles } from "../../src/theme";

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View
      style={[
        styles.tabIconContainer,
        focused && styles.tabIconContainerActive,
      ]}
    >
      <Text style={styles.tabIcon}>{icon}</Text>
    </View>
  );
}

export default function TabLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <StateScreen
        title="Loading your dashboard"
        message="Restoring teacher data and navigation."
        loading
      />
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="summaries"
        options={{
          title: "History",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📋" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="intelligence"
        options={{
          title: "Insights",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="💡" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="weekly"
        options={{
          title: "Weekly",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="📊" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="sync"
        options={{
          title: "Data",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="☁️" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⚙️" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: colors.surface.border,
    height: 60,
    paddingBottom: spacing.xs,
    paddingTop: spacing.xs,
  },
  tabBarLabel: {
    ...textStyles.caption,
    fontWeight: "600",
  },
  tabIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconContainerActive: {
    backgroundColor: colors.primary[50],
  },
  tabIcon: {
    fontSize: 20,
  },
});
