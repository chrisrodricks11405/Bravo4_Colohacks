jest.mock("../../db", () => ({
  getDatabase: jest.fn(),
}));

jest.mock("../../lib/supabase", () => ({
  hasSupabaseConfig: false,
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock("../ai", () => ({
  aiProvider: {
    structureVoiceReflection: jest.fn(),
  },
}));

jest.mock("../liveSession", () => ({
  computeConfusionIndex: jest.fn(() => 0),
  createIntervention: jest.fn(),
  createLessonMarker: jest.fn(),
  listCachedClusters: jest.fn(),
  persistClusters: jest.fn(),
  persistPulseSnapshot: jest.fn(),
  recordLocalQuestion: jest.fn(),
}));

jest.mock("../polls", () => ({
  createPollDraft: jest.fn(),
  persistPollResponses: jest.fn(),
  pushPoll: jest.fn(),
}));

jest.mock("../session", () => ({
  updateSession: jest.fn(),
}));

jest.mock("../studentLiveBroadcast", () => ({
  broadcastAnnouncement: jest.fn(),
  broadcastTeacherPrompt: jest.fn(),
}));

jest.mock("../studentEngagement", () => ({
  createSessionAnnouncement: jest.fn(),
}));

jest.mock("../summaries", () => ({
  generateSessionSummary: jest.fn(),
}));

import {
  composeDemoLessonPlanSeed,
  extractDemoMetadata,
  normalizeYouTubeUrl,
  stripDemoDirective,
} from "../demoFlow";

describe("demoFlow", () => {
  test("normalizes supported YouTube URLs", () => {
    expect(normalizeYouTubeUrl("https://www.youtube.com/watch?v=abc123XYZ_0")).toBe(
      "https://youtu.be/abc123XYZ_0"
    );
    expect(normalizeYouTubeUrl("youtu.be/abc123XYZ_0")).toBe(
      "https://youtu.be/abc123XYZ_0"
    );
    expect(normalizeYouTubeUrl("https://youtube.com/shorts/abc123XYZ_0")).toBe(
      "https://youtu.be/abc123XYZ_0"
    );
    expect(normalizeYouTubeUrl("https://example.com/video")).toBeNull();
  });

  test("stores and retrieves demo metadata inside the lesson seed", () => {
    const lessonSeed = composeDemoLessonPlanSeed({
      existingSeed: "Focus on the middle transition and the final recap.",
      youtubeUrl: "https://www.youtube.com/watch?v=abc123XYZ_0",
      participantCount: 28,
      durationMinutes: 12,
    });

    expect(lessonSeed).toContain("[[classpulse_demo?");
    expect(stripDemoDirective(lessonSeed)).toBe(
      "Focus on the middle transition and the final recap."
    );
    expect(extractDemoMetadata(lessonSeed)).toEqual({
      youtubeUrl: "https://youtu.be/abc123XYZ_0",
      participantCount: 28,
      durationMinutes: 12,
    });
  });
});
