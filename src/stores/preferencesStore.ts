import { create } from "zustand";
import type { TeacherPreferences } from "../types";
import { DEFAULT_PREFERENCES } from "../types";

interface PreferencesState extends TeacherPreferences {
  isLoaded: boolean;
  loadPreferences: (prefs: Partial<TeacherPreferences>) => void;
  updatePreference: <K extends keyof TeacherPreferences>(
    key: K,
    value: TeacherPreferences[K]
  ) => void;
  resetPreferences: () => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULT_PREFERENCES,
  isLoaded: false,

  loadPreferences: (prefs) =>
    set({
      ...DEFAULT_PREFERENCES,
      ...prefs,
      isLoaded: true,
    }),

  updatePreference: (key, value) =>
    set((state) => ({ ...state, [key]: value })),

  resetPreferences: () =>
    set({ ...DEFAULT_PREFERENCES, isLoaded: true }),
}));
