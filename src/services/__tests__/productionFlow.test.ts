jest.mock("../../lib/supabase", () => ({
  hasSupabaseConfig: false,
  supabase: {
    from: jest.fn(),
    channel: jest.fn(),
    functions: {
      invoke: jest.fn(),
    },
    removeChannel: jest.fn(),
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn(),
    },
  },
}));

jest.mock("../../db", () => ({
  getDatabase: jest.fn(),
}));

jest.mock("../../lib/monitoring", () => ({
  addMonitoringBreadcrumb: jest.fn(),
  captureMonitoringException: jest.fn(),
  setMonitoringSession: jest.fn(),
  setMonitoringTag: jest.fn(),
  setMonitoringUser: jest.fn(),
  initializeMonitoring: jest.fn(),
  Sentry: {},
}));

jest.mock("expo-crypto", () => {
  const nodeCrypto = require("node:crypto");

  return {
    CryptoDigestAlgorithm: {
      SHA256: "SHA-256",
    },
    getRandomBytesAsync: jest.fn(async (byteCount: number) =>
      Uint8Array.from({ length: byteCount }, (_, index) => (index + 17) % 255)
    ),
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) =>
      nodeCrypto.createHash("sha256").update(value).digest("hex")
    ),
  };
});

import {
  createSessionAccessTokenPair,
  extractSessionAccessToken,
  hashSessionAccessToken,
} from "../../lib/security";
import {
  sanitizeAnonymousId,
  sanitizeStudentQuestionText,
} from "../../lib/sanitization";
import {
  buildFallbackClusters,
  computeConfusionIndex,
} from "../liveSession";
import { computePollDistribution } from "../polls";
import { buildSessionSummaryFromArtifacts } from "../summaries";
import type {
  AnonymousQuestionPayload,
  InterventionActionPayload,
  LessonMarker,
  QuickPollPayload,
  SessionMeta,
} from "../../types";

describe("production hardening flow", () => {
  test("creates and validates secure session access tokens", async () => {
    const tokenPair = await createSessionAccessTokenPair();
    const qrPayload = `classpulse://join?sessionId=session_secure&code=4821&mode=online&token=${tokenPair.accessToken}`;

    expect(tokenPair.accessToken).toHaveLength(48);
    expect(tokenPair.accessTokenHash).toBe(
      await hashSessionAccessToken(tokenPair.accessToken)
    );
    expect(extractSessionAccessToken(qrPayload)).toBe(tokenPair.accessToken);
  });

  test("sanitizes student-originated identifiers and text before clustering", () => {
    expect(sanitizeAnonymousId(" student-01<script> ")).toBe("student-01script");
    expect(
      sanitizeStudentQuestionText(
        "Why is the minus sign moving?\u202E\t\n\nCan you repeat that?"
      )
    ).toBe("Why is the minus sign moving?\n\nCan you repeat that?");
  });

  test("covers the classroom flow from anonymous questions to summary and poll aggregation", () => {
    const session: SessionMeta = {
      id: "session_flow",
      teacherId: "teacher_1",
      joinCode: "4821",
      qrPayload:
        "classpulse://join?sessionId=session_flow&code=4821&mode=online&token=testtoken",
      accessToken: "testtoken",
      accessTokenHash: "hashed",
      subject: "Science",
      topic: "Balancing equations",
      gradeClass: "8A",
      language: "English",
      lostThreshold: 40,
      mode: "online",
      status: "active",
      participantCount: 28,
      createdAt: "2026-03-28T10:00:00.000Z",
      startedAt: "2026-03-28T10:02:00.000Z",
    };

    const lessonMarkers: LessonMarker[] = [
      {
        id: "marker_intro",
        sessionId: session.id,
        type: "example",
        label: "Worked example",
        timestamp: "2026-03-28T10:08:00.000Z",
      },
    ];

    const questions: AnonymousQuestionPayload[] = [
      {
        id: "q1",
        sessionId: session.id,
        anonymousId: "student_a",
        text: "Which step comes after removing the coefficient?",
        timestamp: "2026-03-28T10:09:00.000Z",
      },
      {
        id: "q2",
        sessionId: session.id,
        anonymousId: "student_b",
        text: "Can you explain the next step in balancing equations?",
        timestamp: "2026-03-28T10:09:20.000Z",
      },
      {
        id: "q3",
        sessionId: session.id,
        anonymousId: "student_c",
        text: "Why does the minus sign move to the other side?",
        timestamp: "2026-03-28T10:10:00.000Z",
      },
    ];

    const clusters = buildFallbackClusters({
      sessionId: session.id,
      questions,
      lessonMarkers,
      existingClusters: [],
      session,
    });

    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0]?.affectedCount).toBeGreaterThanOrEqual(2);

    const snapshots = [
      {
        sessionId: session.id,
        timestamp: "2026-03-28T10:06:00.000Z",
        gotItCount: 20,
        sortOfCount: 5,
        lostCount: 2,
        totalActive: 27,
        disconnectedCount: 1,
        confusionIndex: computeConfusionIndex({
          gotItCount: 20,
          sortOfCount: 5,
          lostCount: 2,
          totalActive: 27,
          disconnectedCount: 1,
        }),
      },
      {
        sessionId: session.id,
        timestamp: "2026-03-28T10:11:00.000Z",
        gotItCount: 14,
        sortOfCount: 8,
        lostCount: 5,
        totalActive: 27,
        disconnectedCount: 1,
        confusionIndex: computeConfusionIndex({
          gotItCount: 14,
          sortOfCount: 8,
          lostCount: 5,
          totalActive: 27,
          disconnectedCount: 1,
        }),
      },
      {
        sessionId: session.id,
        timestamp: "2026-03-28T10:16:00.000Z",
        gotItCount: 19,
        sortOfCount: 6,
        lostCount: 2,
        totalActive: 27,
        disconnectedCount: 1,
        confusionIndex: computeConfusionIndex({
          gotItCount: 19,
          sortOfCount: 6,
          lostCount: 2,
          totalActive: 27,
          disconnectedCount: 1,
        }),
      },
    ];

    const interventions: InterventionActionPayload[] = [
      {
        id: "intervention_1",
        sessionId: session.id,
        type: "example",
        clusterId: clusters[0]?.id,
        lessonMarkerId: lessonMarkers[0]?.id,
        timestamp: "2026-03-28T10:12:00.000Z",
        confusionBefore: 37.5,
        confusionAfter: 21.5,
        recoveryScore: 16,
        recoveryWindowSeconds: 120,
      },
    ];

    const summary = buildSessionSummaryFromArtifacts({
      session,
      snapshots,
      lessonMarkers,
      interventions,
      clusters,
    });

    expect(summary.totalParticipants).toBe(28);
    expect(summary.topClusters.length).toBeGreaterThan(0);
    expect(summary.interventionStats[0]?.successfulCount).toBe(1);
    expect(summary.peakConfusionIndex).toBeGreaterThan(summary.endingConfusionIndex);

    const poll: QuickPollPayload = {
      id: "poll_1",
      sessionId: session.id,
      question: "Which statement best matches your understanding?",
      options: [
        { index: 0, text: "I can do it myself" },
        { index: 1, text: "I need one more example" },
        { index: 2, text: "I am still lost" },
      ],
      source: "manual",
      status: "active",
      createdAt: "2026-03-28T10:13:00.000Z",
      updatedAt: "2026-03-28T10:13:00.000Z",
      pushedAt: "2026-03-28T10:13:00.000Z",
    };

    const distribution = computePollDistribution(poll, [
      {
        id: "r1",
        pollId: poll.id,
        sessionId: session.id,
        anonymousId: "student_a",
        optionIndex: 1,
        submittedAt: "2026-03-28T10:13:30.000Z",
      },
      {
        id: "r2",
        pollId: poll.id,
        sessionId: session.id,
        anonymousId: "student_b",
        optionIndex: 0,
        submittedAt: "2026-03-28T10:13:40.000Z",
      },
      {
        id: "r3",
        pollId: poll.id,
        sessionId: session.id,
        anonymousId: "student_a",
        optionIndex: 0,
        submittedAt: "2026-03-28T10:13:50.000Z",
      },
    ]);

    expect(distribution.totalResponses).toBe(2);
    expect(distribution.leadingOptionIndex).toBe(0);
    expect(distribution.distribution[0]?.count).toBe(2);
  });
});
