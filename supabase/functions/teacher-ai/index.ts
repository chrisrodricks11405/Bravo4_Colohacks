import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type ReasonChip =
  | "step_unclear"
  | "language_friction"
  | "missing_prerequisite"
  | "too_fast"
  | "notation_confusion"
  | "example_needed"
  | "other";

interface ClusterContext {
  clusterId: string;
  title: string;
  summary: string;
  representativeQuestion: string;
  topic: string;
  subject: string;
  language: string;
  affectedCount: number;
  reasonChip?: ReasonChip;
  translation?: string;
  suggestedInterventions?: string[];
}

interface ReteachPack {
  simpleExplanation: string;
  localLanguageExplanation?: string;
  analogyExplanation: string;
  boardScript: string;
  misconceptionExample: string;
}

interface AIQuickPollSuggestion {
  question: string;
  options: string[];
  correctIndex: number;
  rationale: string;
}

interface TeacherVoicePollContext {
  subject: string;
  topic: string;
  language: string;
  gradeClass?: string;
}

interface SessionSummaryAIInput {
  subject: string;
  topic: string;
  gradeClass: string;
  durationMinutes: number;
  totalParticipants: number;
  peakMomentLabel?: string;
  peakConfusionIndex: number;
  peakLostPercent: number;
  endingConfusionIndex: number;
  endingLostPercent: number;
  topClusterTitle?: string;
  topClusterAffectedCount?: number;
  topReasonChip?: string;
  dominantPollOption?: string;
  dominantPollPercent?: number;
  bestInterventionType?: string;
  bestInterventionRecovery?: number;
  recoveryScore: number;
}

interface AISessionSummary {
  narrative: string;
  suggestedOpeningActivity: string;
  source: "edge" | "fallback";
}

interface VoiceReflectionContext {
  subject: string;
  topic: string;
  gradeClass: string;
  suggestedNextActivity?: string;
}

interface VoiceReflectionAction {
  id: string;
  title: string;
  detail: string;
  timing: "opening" | "check_in" | "follow_up";
}

interface VoiceReflectionPlan {
  summary: string;
  actions: VoiceReflectionAction[];
  source: "edge" | "fallback";
}

interface AIWeeklyCoaching {
  mostDifficultTopic: string;
  worstTimeSlot: string;
  bestInterventionStyle: string;
  revisionPriorities: string[];
  narrative: string;
}

interface WeeklyTopicDifficultyCell {
  subject: string;
  topic: string;
  avgDifficultyScore: number;
}

interface WeeklyHeatmapCell {
  dayLabel: string;
  slotLabel: string;
  avgConfusionIndex: number;
  avgRecoveryScore: number;
  sessionCount: number;
}

interface WeeklyInterventionTrend {
  type: string;
  usageCount: number;
  successfulCount: number;
  avgRecoveryScore: number;
}

interface WeeklyRecurringMisconception {
  title: string;
}

interface WeeklyLanguageFrictionPoint {
  date: string;
  label: string;
  sessionCount: number;
  frictionSessionCount: number;
  frictionRate: number;
}

interface WeeklyInsightAggregate {
  totalSessions: number;
  topicDifficultyHeatmap: WeeklyTopicDifficultyCell[];
  classPeriodConfusionHeatmap: WeeklyHeatmapCell[];
  interventionEffectivenessTrends: WeeklyInterventionTrend[];
  recurringMisconceptions: WeeklyRecurringMisconception[];
  languageFrictionTrend: WeeklyLanguageFrictionPoint[];
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const openAIKey = Deno.env.get("OPENAI_API_KEY");
const transcriptionModel = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") ?? "gpt-4o-transcribe";
const speechModel = Deno.env.get("OPENAI_TTS_MODEL") ?? "gpt-4o-mini-tts";
const deepgramApiKey = Deno.env.get("DEEPGRAM_API_KEY");
const deepgramApiBaseUrl = Deno.env.get("DEEPGRAM_API_BASE_URL") ?? "https://api.deepgram.com/v1";
const deepgramSttModel = Deno.env.get("DEEPGRAM_STT_MODEL") ?? "nova-3";
const runwayApiSecret = Deno.env.get("RUNWAYML_API_SECRET");
const runwayApiVersion = Deno.env.get("RUNWAYML_API_VERSION") ?? "2024-11-06";
const runwayApiBaseUrl = Deno.env.get("RUNWAYML_API_BASE_URL") ?? "https://api.dev.runwayml.com/v1";
const runwaySpeechModel = Deno.env.get("RUNWAYML_TTS_MODEL") ?? "eleven_multilingual_v2";
const runwayDefaultPresetVoice =
  Deno.env.get("RUNWAYML_TTS_PRESET_DEFAULT") ?? "Leslie";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function buildTopicHandle(context: ClusterContext) {
  return context.title.replace(/^Questions about\s+/i, "").trim() || context.topic;
}

function buildReasonHint(reasonChip?: ReasonChip) {
  switch (reasonChip) {
    case "step_unclear":
      return "Students are losing the sequence of steps.";
    case "language_friction":
      return "Wording and classroom language may be blocking comprehension.";
    case "missing_prerequisite":
      return "The cluster points to a missing prerequisite concept.";
    case "too_fast":
      return "The pace looks faster than the room can comfortably track.";
    case "notation_confusion":
      return "Symbols or notation appear to be causing friction.";
    case "example_needed":
      return "Students want one more worked example before moving on.";
    default:
      return "Students need a tighter explanation and a quick check for understanding.";
  }
}

function buildPollOptions(context: ClusterContext) {
  const focus = buildTopicHandle(context);

  return [
    `I can explain ${focus} clearly.`,
    `I know the first step but not the full method.`,
    `I need one more example.`,
    `I am still confused about the idea itself.`,
  ];
}

function buildReteachPack(ctx: ClusterContext): ReteachPack {
  const focus = buildTopicHandle(ctx);
  const reasonHint = buildReasonHint(ctx.reasonChip);

  return {
    simpleExplanation: `Let's slow down and rebuild ${focus} in one clean pass. ${reasonHint} Start from the representative question, name the key term, then walk the class through the next small step before asking for a thumbs check.`,
    localLanguageExplanation:
      ctx.translation ??
      `If needed, restate the explanation in ${ctx.language} using shorter phrases and one concrete example.`,
    analogyExplanation: `${focus} can be reframed like a checkpoint path: students should know where they start, what rule they apply, and what the result should look like before they move on.`,
    boardScript: `1. Write the student question: "${ctx.representativeQuestion}"\n2. Circle the part causing friction.\n3. Solve one example slowly.\n4. Ask the class which step changes next and why.\n5. Re-check the room with a quick poll.`,
    misconceptionExample: `A common mistake is jumping to the final answer before checking the middle step in ${focus}. Show the incorrect step first, then correct it side by side.`,
  };
}

function buildQuickPoll(ctx: ClusterContext): AIQuickPollSuggestion {
  const focus = buildTopicHandle(ctx);

  return {
    question: `Quick check on ${focus}: which statement best matches your understanding right now?`,
    options: buildPollOptions(ctx),
    correctIndex: 0,
    rationale:
      "This poll separates confident understanding from step-level confusion so the teacher can choose between moving on, reworking an example, or slowing the pace.",
  };
}

function normalizePrompt(prompt: string) {
  return prompt.replace(/\s+/g, " ").trim();
}

function buildTeacherVoicePoll(
  prompt: string,
  context: TeacherVoicePollContext
): AIQuickPollSuggestion {
  const normalizedPrompt = normalizePrompt(prompt);
  const topicHandle = context.topic.trim() || context.subject.trim() || "today's idea";
  const question =
    normalizedPrompt.length === 0
      ? `Quick check on ${topicHandle}: which option best matches your understanding right now?`
      : /[?!.]$/.test(normalizedPrompt)
        ? normalizedPrompt
        : `${normalizedPrompt}?`;

  return {
    question,
    options: [
      "I can answer it and explain why.",
      "I can narrow it down but need one hint.",
      `I remember part of ${topicHandle} but not the full method.`,
      "I need a short reteach before I can answer.",
    ],
    correctIndex: 0,
    rationale:
      "This voice-to-poll draft separates confident understanding from partial recall and reteach need so the teacher can review, edit, and push quickly.",
  };
}

function splitTranscriptSentences(transcript: string) {
  return transcript
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function buildVoiceReflectionPlan(
  transcript: string,
  context: VoiceReflectionContext
): VoiceReflectionPlan {
  const normalizedTranscript = normalizePrompt(transcript);

  if (!normalizedTranscript) {
    return {
      summary: "",
      actions: [],
      source: "edge",
    };
  }

  const topicHandle = context.topic.trim() || "the topic";
  const defaultOpening =
    context.suggestedNextActivity?.trim() ||
    `Open the next ${context.subject} lesson with a two-minute recap of ${topicHandle}.`;

  const actionCandidates = [
    {
      test: /(slow|pace|rushed|too fast|speed)/i,
      title: "Slow the opener",
      detail: `Reopen ${topicHandle} with a slower first example and a short pause before students answer.`,
      timing: "opening" as const,
    },
    {
      test: /(example|worked example|model|show)/i,
      title: "Lead with one more example",
      detail: `Start with one fresh worked example on ${topicHandle} before moving into independent practice.`,
      timing: "opening" as const,
    },
    {
      test: /(language|wording|term|vocab|translation|hindi|marathi|kannada|english)/i,
      title: "Pre-teach vocabulary",
      detail: "Restate the key terms in simpler classroom language and ask one student to paraphrase the idea.",
      timing: "opening" as const,
    },
    {
      test: /(check|poll|thumb|confidence|understanding)/i,
      title: "Add a fast check-in",
      detail: "Run a 30-second confidence check after the first explanation so confusion surfaces earlier.",
      timing: "check_in" as const,
    },
    {
      test: /(notation|symbol|sign)/i,
      title: "Review notation explicitly",
      detail: "Contrast the correct notation with the most likely mistake before practice begins.",
      timing: "opening" as const,
    },
    {
      test: /(prerequisite|foundation|basics|prior knowledge)/i,
      title: "Rebuild the prerequisite",
      detail: `Spend the first minute reconnecting the prerequisite idea behind ${topicHandle}.`,
      timing: "opening" as const,
    },
  ];

  const actions = actionCandidates
    .filter((candidate) => candidate.test.test(normalizedTranscript))
    .slice(0, 3)
    .map((candidate, index) => ({
      id: `reflection_action_${index + 1}`,
      title: candidate.title,
      detail: candidate.detail,
      timing: candidate.timing,
    }));

  if (actions.length === 0) {
    actions.push(
      {
        id: "reflection_action_1",
        title: "Reopen with a clear recap",
        detail: defaultOpening,
        timing: "opening",
      },
      {
        id: "reflection_action_2",
        title: "Check understanding earlier",
        detail: "Add a fast poll or verbal check after the first worked step instead of waiting until practice.",
        timing: "check_in",
      },
      {
        id: "reflection_action_3",
        title: "Capture one follow-up note",
        detail: `Watch whether the same confusion returns during the next ${context.gradeClass} lesson and log it if it does.`,
        timing: "follow_up",
      }
    );
  }

  const summary =
    splitTranscriptSentences(normalizedTranscript).slice(0, 2).join(" ") ||
    `Focus the next class on a cleaner opening and earlier check for ${topicHandle}.`;

  return {
    summary,
    actions,
    source: "edge",
  };
}

function getAudioFileExtension(mimeType?: string) {
  switch (mimeType) {
    case "audio/mp4":
    case "audio/m4a":
      return "m4a";
    case "audio/mp3":
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
    case "audio/webm":
      return "webm";
    default:
      return "m4a";
  }
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }

  return btoa(binary);
}

async function parseOpenAIError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim();

  try {
    const data = await response.json();
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error &&
      typeof data.error === "object" &&
      "message" in data.error &&
      typeof data.error.message === "string"
        ? data.error.message
        : null;

    return message ?? fallback;
  } catch {
    return fallback;
  }
}

async function parseRunwayError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim();

  try {
    const data = await response.json();
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error &&
      typeof data.error === "object" &&
      "message" in data.error &&
      typeof data.error.message === "string"
        ? data.error.message
        : null;

    return message ?? fallback;
  } catch {
    return fallback;
  }
}

async function parseDeepgramError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim();

  try {
    const data = await response.json();
    const message =
      data &&
      typeof data === "object" &&
      (("err_msg" in data && typeof data.err_msg === "string" && data.err_msg) ||
        ("error" in data && typeof data.error === "string" && data.error) ||
        ("message" in data && typeof data.message === "string" && data.message));

    return typeof message === "string" && message.length > 0 ? message : fallback;
  } catch {
    return fallback;
  }
}

function resolveDeepgramLanguage(locale?: string) {
  const normalized = locale?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("hi") || normalized.startsWith("en")) {
    return "multi";
  }

  if (normalized.startsWith("mr")) {
    return "mr";
  }

  if (normalized.startsWith("kn")) {
    return "kn";
  }

  if (normalized.startsWith("es")) {
    return "es";
  }

  return normalized;
}

async function transcribeWithDeepgram(args: {
  audioBase64: string;
  mimeType?: string;
  locale?: string;
}) {
  if (!deepgramApiKey) {
    throw new Error("Voice transcription is unavailable because DEEPGRAM_API_KEY is missing.");
  }

  const audioBytes = decodeBase64(args.audioBase64);
  const params = new URLSearchParams({
    model: deepgramSttModel,
    punctuate: "true",
    smart_format: "true",
  });
  const language = resolveDeepgramLanguage(args.locale);

  if (language) {
    params.set("language", language);
  } else {
    params.set("detect_language", "true");
  }

  const response = await fetch(`${deepgramApiBaseUrl}/listen?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${deepgramApiKey}`,
      "Content-Type": args.mimeType || "audio/m4a",
    },
    body: audioBytes,
  });

  if (!response.ok) {
    throw new Error(await parseDeepgramError(response));
  }

  const data = await response.json();
  const transcript =
    data &&
    typeof data === "object" &&
    "results" in data &&
    data.results &&
    typeof data.results === "object" &&
    "channels" in data.results &&
    Array.isArray(data.results.channels) &&
    data.results.channels[0] &&
    typeof data.results.channels[0] === "object" &&
    "alternatives" in data.results.channels[0] &&
    Array.isArray(data.results.channels[0].alternatives) &&
    data.results.channels[0].alternatives[0] &&
    typeof data.results.channels[0].alternatives[0] === "object" &&
    "transcript" in data.results.channels[0].alternatives[0] &&
    typeof data.results.channels[0].alternatives[0].transcript === "string"
      ? data.results.channels[0].alternatives[0].transcript
      : "";

  return transcript.trim();
}

function resolveRunwayPresetVoice(requestedVoice?: string, locale?: string) {
  const normalizedVoice = requestedVoice?.trim();
  const normalizedLocale = locale?.trim().toLowerCase() ?? "";

  const aliasMap: Record<string, string> = {
    marin: "Leslie",
    cedar: "Arjun",
    alloy: "Noah",
    coral: "Rachel",
    sage: "Elias",
  };

  if (normalizedVoice && aliasMap[normalizedVoice]) {
    return aliasMap[normalizedVoice];
  }

  if (normalizedLocale.startsWith("hi")) {
    return "Arjun";
  }

  return runwayDefaultPresetVoice;
}

async function createRunwayTask(
  path: string,
  body: Record<string, unknown>
) {
  if (!runwayApiSecret) {
    throw new Error("Runway speech generation is unavailable because RUNWAYML_API_SECRET is missing.");
  }

  const response = await fetch(`${runwayApiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runwayApiSecret}`,
      "Content-Type": "application/json",
      "X-Runway-Version": runwayApiVersion,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await parseRunwayError(response));
  }

  const data = await response.json();
  const taskId =
    data &&
    typeof data === "object" &&
    "id" in data &&
    typeof data.id === "string"
      ? data.id
      : null;

  if (!taskId) {
    throw new Error("Runway did not return a task ID.");
  }

  return taskId;
}

async function waitForRunwayTaskOutput(taskId: string, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${runwayApiBaseUrl}/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${runwayApiSecret}`,
        "X-Runway-Version": runwayApiVersion,
      },
    });

    if (!response.ok) {
      throw new Error(await parseRunwayError(response));
    }

    const data = await response.json();
    const status =
      data &&
      typeof data === "object" &&
      "status" in data &&
      typeof data.status === "string"
        ? data.status
        : null;

    if (status === "SUCCEEDED") {
      const output =
        data &&
        typeof data === "object" &&
        "output" in data &&
        Array.isArray(data.output)
          ? data.output
          : null;
      const outputUrl = output?.find((value): value is string => typeof value === "string");

      if (!outputUrl) {
        throw new Error("Runway completed the task without returning audio output.");
      }

      return outputUrl;
    }

    if (status === "FAILED" || status === "CANCELED" || status === "CANCELLED") {
      const failureMessage =
        data &&
        typeof data === "object" &&
        "failure" in data &&
        data.failure &&
        typeof data.failure === "object" &&
        "message" in data.failure &&
        typeof data.failure.message === "string"
          ? data.failure.message
          : `Runway task ended with status ${status}.`;

      throw new Error(failureMessage);
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new Error("Runway speech generation timed out.");
}

async function downloadRunwayAudio(outputUrl: string) {
  const response = await fetch(outputUrl);

  if (!response.ok) {
    throw new Error("Runway returned an audio URL that could not be downloaded.");
  }

  const audioBytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "audio/mpeg";

  return {
    audioBase64: encodeBase64(audioBytes),
    mimeType,
  };
}

async function transcribeTeacherVoicePrompt(args: {
  audioBase64: string;
  mimeType?: string;
  locale?: string;
  hint?: string;
}) {
  if (deepgramApiKey) {
    const transcript = await transcribeWithDeepgram(args);
    if (!transcript) {
      throw new Error("The voice provider returned an empty transcript.");
    }

    return transcript;
  }

  if (!openAIKey) {
    throw new Error(
      "Voice transcription is unavailable because neither DEEPGRAM_API_KEY nor OPENAI_API_KEY is configured."
    );
  }

  const audioBytes = decodeBase64(args.audioBase64);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([audioBytes], { type: args.mimeType || "audio/m4a" }),
    `teacher-voice.${getAudioFileExtension(args.mimeType)}`
  );
  formData.append("model", transcriptionModel);
  formData.append("response_format", "text");

  if (args.hint?.trim()) {
    formData.append("prompt", args.hint.trim());
  } else if (args.locale?.trim()) {
    formData.append(
      "prompt",
      `Transcribe this short classroom note clearly for a teacher using ${args.locale.trim()}.`
    );
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAIKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseOpenAIError(response));
  }

  return (await response.text()).trim();
}

async function generateSpokenExplanation(args: {
  text: string;
  locale?: string;
  voice?: string;
}) {
  if (runwayApiSecret) {
    const taskId = await createRunwayTask("/text_to_speech", {
      model: runwaySpeechModel,
      promptText: args.text.slice(0, 1_000),
      voice: {
        type: "runway-preset",
        presetId: resolveRunwayPresetVoice(args.voice, args.locale),
      },
    });

    const outputUrl = await waitForRunwayTaskOutput(taskId);
    return downloadRunwayAudio(outputUrl);
  }

  if (!openAIKey) {
    throw new Error(
      "Speech generation is unavailable because neither RUNWAYML_API_SECRET nor OPENAI_API_KEY is configured."
    );
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAIKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: speechModel,
      voice: args.voice || "marin",
      input: args.text,
      response_format: "wav",
    }),
  });

  if (!response.ok) {
    throw new Error(await parseOpenAIError(response));
  }

  const audioBytes = new Uint8Array(await response.arrayBuffer());

  return {
    audioBase64: encodeBase64(audioBytes),
    mimeType: "audio/wav",
  };
}

function formatInterventionHandle(value?: string) {
  if (!value) {
    return "a short reteach reset";
  }

  if (value === "language_switch") {
    return "a language switch";
  }

  if (value === "board_script") {
    return "a board walkthrough";
  }

  if (value === "bilingual_explanation") {
    return "a bilingual explanation";
  }

  return value.replace(/_/g, " ");
}

function buildSessionSummary(input: SessionSummaryAIInput): AISessionSummary {
  const peakMoment = input.peakMomentLabel
    ? `during ${input.peakMomentLabel}`
    : "during the busiest point of the lesson";
  const dominantSignal = input.dominantPollOption
    ? `Most students selected "${input.dominantPollOption}" (${input.dominantPollPercent?.toFixed(0) ?? 0}%).`
    : input.topClusterTitle
      ? `The biggest misconception cluster centered on ${input.topClusterTitle.toLowerCase()}.`
      : input.topReasonChip
        ? `The dominant friction signal was ${input.topReasonChip.replace(/_/g, " ")}.`
        : "Students surfaced a few different confusion patterns rather than one dominant signal.";
  const interventionLine =
    input.bestInterventionType && input.bestInterventionRecovery != null
      ? `After ${formatInterventionHandle(input.bestInterventionType)}, Lost dropped from ${input.peakLostPercent.toFixed(1)}% to ${input.endingLostPercent.toFixed(1)}%.`
      : `Lost moved from ${input.peakLostPercent.toFixed(1)}% at the peak to ${input.endingLostPercent.toFixed(1)}% by the close.`;

  let suggestedOpeningActivity = `Begin the next ${input.subject} class with a 3-minute recap of ${input.topic}, then ask one confidence check before introducing anything new.`;

  switch (input.topReasonChip) {
    case "step_unclear":
      suggestedOpeningActivity =
        "Open with one worked example broken into numbered steps, then ask students to predict the next move before you solve it.";
      break;
    case "language_friction":
      suggestedOpeningActivity =
        "Start with a bilingual vocabulary warm-up: restate the key terms in simpler language, then ask a student to paraphrase the idea.";
      break;
    case "notation_confusion":
      suggestedOpeningActivity =
        "Begin with a symbol check: put the key notation on the board, contrast the common mistake, and have students explain what each symbol means.";
      break;
    case "example_needed":
      suggestedOpeningActivity =
        "Start with one fresh worked example and pause midway so students can call out the next step before you continue.";
      break;
    case "missing_prerequisite":
      suggestedOpeningActivity =
        "Use the opener to rebuild the prerequisite idea in one minute, then connect it directly to today’s first question.";
      break;
    case "too_fast":
      suggestedOpeningActivity =
        "Open with a slower recap of yesterday’s transition point and give the room ten silent seconds before students answer.";
      break;
    default:
      break;
  }

  return {
    narrative: `Confusion peaked ${peakMoment} at ${input.peakConfusionIndex.toFixed(1)}. ${dominantSignal} ${interventionLine} Recovery closed at ${input.recoveryScore.toFixed(0)} out of 100.`,
    suggestedOpeningActivity,
    source: "edge",
  };
}

function formatTopicSummary(topic?: WeeklyTopicDifficultyCell) {
  if (!topic) {
    return "No clear topic yet";
  }

  return `${topic.topic} (${topic.subject})`;
}

function getWorstHeatmapCell(heatmap?: WeeklyHeatmapCell[]) {
  return (heatmap ?? [])
    .filter((cell) => cell.sessionCount > 0)
    .sort(
      (left, right) =>
        right.avgConfusionIndex - left.avgConfusionIndex ||
        left.avgRecoveryScore - right.avgRecoveryScore ||
        right.sessionCount - left.sessionCount
    )[0];
}

function getBestIntervention(trends?: WeeklyInterventionTrend[]) {
  return (trends ?? [])
    .filter((trend) => trend.usageCount > 0)
    .sort(
      (left, right) =>
        right.avgRecoveryScore - left.avgRecoveryScore ||
        right.successfulCount - left.successfulCount ||
        right.usageCount - left.usageCount
    )[0];
}

function getPeakLanguageFriction(trend?: WeeklyLanguageFrictionPoint[]) {
  return (trend ?? [])
    .filter((point) => point.sessionCount > 0)
    .sort(
      (left, right) =>
        right.frictionRate - left.frictionRate ||
        right.frictionSessionCount - left.frictionSessionCount ||
        left.date.localeCompare(right.date)
    )[0];
}

function buildWeeklyInsight(input: WeeklyInsightAggregate): AIWeeklyCoaching {
  if (input.totalSessions <= 0) {
    return {
      mostDifficultTopic: "Not enough sessions yet",
      worstTimeSlot: "Not enough sessions yet",
      bestInterventionStyle: "Not enough interventions yet",
      revisionPriorities: ["Teach a few more sessions in this range to unlock coaching."],
      narrative: "Weekly insight will become more useful after multiple saved summaries.",
    };
  }

  const mostDifficultTopic = formatTopicSummary(input.topicDifficultyHeatmap?.[0]);
  const worstTimeSlotCell = getWorstHeatmapCell(input.classPeriodConfusionHeatmap);
  const worstTimeSlot = worstTimeSlotCell
    ? `${worstTimeSlotCell.dayLabel} ${worstTimeSlotCell.slotLabel}`
    : "No time-slot signal yet";
  const bestIntervention = getBestIntervention(input.interventionEffectivenessTrends);
  const bestInterventionStyle = bestIntervention
    ? formatInterventionHandle(bestIntervention.type)
    : "Not enough interventions yet";
  const topCluster = input.recurringMisconceptions?.[0];
  const peakLanguageFriction = getPeakLanguageFriction(input.languageFrictionTrend);
  const revisionPriorities = [
    input.topicDifficultyHeatmap?.[0]
      ? `Revisit ${input.topicDifficultyHeatmap[0].topic} in ${input.topicDifficultyHeatmap[0].subject}; difficulty is averaging ${input.topicDifficultyHeatmap[0].avgDifficultyScore.toFixed(0)}.`
      : null,
    topCluster
      ? `Address the recurring misconception "${topCluster.title}" before new content builds on it.`
      : null,
    peakLanguageFriction && peakLanguageFriction.frictionRate > 0
      ? `Pre-teach vocabulary or use bilingual framing around ${peakLanguageFriction.label}; language friction appeared in ${peakLanguageFriction.frictionRate.toFixed(0)}% of sessions that day.`
      : worstTimeSlotCell
        ? `Plan a shorter recap and faster comprehension checks for ${worstTimeSlot.toLowerCase()}.`
        : null,
  ].filter((item): item is string => Boolean(item));

  return {
    mostDifficultTopic,
    worstTimeSlot,
    bestInterventionStyle,
    revisionPriorities,
    narrative: `Across ${input.totalSessions} sessions, ${mostDifficultTopic} created the heaviest strain. ${worstTimeSlot} showed the highest confusion signal, while ${bestInterventionStyle} delivered the strongest recovery pattern.`,
  };
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await request.json()) as {
      action?:
        | "generateReteachPack"
        | "generateQuickPoll"
        | "generateTeacherVoicePoll"
        | "generateSessionSummary"
        | "generateWeeklyInsight"
        | "structureVoiceReflection"
        | "transcribeTeacherVoicePrompt"
        | "generateSpokenExplanation";
      clusterContext?: ClusterContext;
      prompt?: string;
      promptContext?: TeacherVoicePollContext;
      summaryInput?: SessionSummaryAIInput;
      weeklyInsight?: WeeklyInsightAggregate;
      transcript?: string;
      reflectionContext?: VoiceReflectionContext;
      audioBase64?: string;
      mimeType?: string;
      locale?: string;
      hint?: string;
      text?: string;
      voice?: string;
    };

    const action = body.action;
    const clusterContext = body.clusterContext;
    const prompt = body.prompt;
    const promptContext = body.promptContext;
    const summaryInput = body.summaryInput;
    const weeklyInsight = body.weeklyInsight;
    const transcript = body.transcript;
    const reflectionContext = body.reflectionContext;

    if (!action) {
      return jsonResponse({ error: "Action is required." }, { status: 400 });
    }

    if (action === "generateReteachPack") {
      if (!clusterContext) {
        return jsonResponse(
          { error: "clusterContext is required for generateReteachPack." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildReteachPack(clusterContext) });
    }

    if (action === "generateQuickPoll") {
      if (!clusterContext) {
        return jsonResponse(
          { error: "clusterContext is required for generateQuickPoll." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildQuickPoll(clusterContext) });
    }

    if (action === "generateTeacherVoicePoll") {
      if (!prompt || !promptContext) {
        return jsonResponse(
          { error: "prompt and promptContext are required for generateTeacherVoicePoll." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildTeacherVoicePoll(prompt, promptContext) });
    }

    if (action === "generateSessionSummary") {
      if (!summaryInput) {
        return jsonResponse(
          { error: "summaryInput is required for generateSessionSummary." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildSessionSummary(summaryInput) });
    }

    if (action === "generateWeeklyInsight") {
      if (!weeklyInsight) {
        return jsonResponse(
          { error: "weeklyInsight is required for generateWeeklyInsight." },
          { status: 400 }
        );
      }

      return jsonResponse({ result: buildWeeklyInsight(weeklyInsight) });
    }

    if (action === "structureVoiceReflection") {
      if (!transcript || !reflectionContext) {
        return jsonResponse(
          { error: "transcript and reflectionContext are required for structureVoiceReflection." },
          { status: 400 }
        );
      }

      return jsonResponse({
        result: buildVoiceReflectionPlan(transcript, reflectionContext),
      });
    }

    if (action === "transcribeTeacherVoicePrompt") {
      if (!body.audioBase64) {
        return jsonResponse(
          { error: "audioBase64 is required for transcribeTeacherVoicePrompt." },
          { status: 400 }
        );
      }

      const text = await transcribeTeacherVoicePrompt({
        audioBase64: body.audioBase64,
        mimeType: body.mimeType,
        locale: body.locale,
        hint: body.hint,
      });

      return jsonResponse({ text });
    }

    if (action === "generateSpokenExplanation") {
      if (!body.text) {
        return jsonResponse(
          { error: "text is required for generateSpokenExplanation." },
          { status: 400 }
        );
      }

      return jsonResponse(
        await generateSpokenExplanation({
          text: body.text,
          locale: body.locale,
          voice: body.voice,
        })
      );
    }

    return jsonResponse({ error: "Unsupported AI action." }, { status: 400 });
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown teacher AI function error.",
      },
      { status: 500 }
    );
  }
});
