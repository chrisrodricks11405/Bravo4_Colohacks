/** Teacher preferences stored locally */
export interface TeacherPreferences {
  defaultSubject?: string;
  defaultGradeClass?: string;
  defaultLanguage: string;
  defaultLostThreshold: number;
  voiceEnabled: boolean;
  ttsVoice?: string;
  ttsLocale?: string;
  aiProviderEnabled: boolean;
  theme: "light" | "dark" | "system";
}

export const DEFAULT_PREFERENCES: TeacherPreferences = {
  defaultLanguage: "en",
  defaultLostThreshold: 40,
  voiceEnabled: false,
  ttsVoice: "marin",
  ttsLocale: "en-US",
  aiProviderEnabled: true,
  theme: "light",
};
