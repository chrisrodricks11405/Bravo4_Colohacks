/** Lesson marker placed by teacher during session */
export interface LessonMarker {
  id: string;
  sessionId: string;
  type: LessonMarkerType;
  label?: string;
  timestamp: string;
}

export type LessonMarkerType =
  | "new_concept"
  | "example"
  | "practice"
  | "review"
  | "question_time"
  | "custom";
