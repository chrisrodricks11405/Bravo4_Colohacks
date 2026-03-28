import React, { useEffect } from "react";
import { loadTeacherPreferences } from "../services/preferences";
import { useDatabaseReady } from "./DatabaseProvider";
import { usePreferencesStore } from "../stores";

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const isDatabaseReady = useDatabaseReady();
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences);

  useEffect(() => {
    if (!isDatabaseReady) {
      return;
    }

    let isActive = true;

    const hydratePreferences = async () => {
      try {
        const preferences = await loadTeacherPreferences();
        if (isActive) {
          loadPreferences(preferences);
        }
      } catch (error) {
        console.error("Failed to load teacher preferences:", error);
        if (isActive) {
          loadPreferences({});
        }
      }
    };

    hydratePreferences();

    return () => {
      isActive = false;
    };
  }, [isDatabaseReady, loadPreferences]);

  return <>{children}</>;
}
