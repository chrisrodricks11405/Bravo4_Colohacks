import { getDatabase } from "../db";
import type { TeacherPreferences } from "../types";

type PreferenceKey = keyof TeacherPreferences;
type PreferenceRow = { key: string; value: string };

const UPSERT_PREFERENCE_SQL = `
  INSERT INTO teacher_preferences (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`;

const PREFERENCE_KEYS: PreferenceKey[] = [
  "defaultSubject",
  "defaultGradeClass",
  "defaultLanguage",
  "defaultLostThreshold",
  "voiceEnabled",
  "ttsVoice",
  "ttsLocale",
  "aiProviderEnabled",
  "theme",
];

export async function loadTeacherPreferences(): Promise<Partial<TeacherPreferences>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PreferenceRow>(
    "SELECT key, value FROM teacher_preferences;"
  );

  return rows.reduce<Partial<TeacherPreferences>>((accumulator, row) => {
    if (!PREFERENCE_KEYS.includes(row.key as PreferenceKey)) {
      return accumulator;
    }

    const key = row.key as PreferenceKey;
    const parsedValue = JSON.parse(row.value) as TeacherPreferences[PreferenceKey];

    if (parsedValue === null) {
      return accumulator;
    }

    (accumulator as Record<string, unknown>)[key] = parsedValue;

    return accumulator;
  }, {});
}

export async function saveTeacherPreferences(
  preferences: TeacherPreferences
): Promise<void> {
  const db = await getDatabase();

  for (const key of PREFERENCE_KEYS) {
    await db.runAsync(UPSERT_PREFERENCE_SQL, key, JSON.stringify(preferences[key] ?? null));
  }
}
