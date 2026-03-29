import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type StudentAction =
  | "join"
  | "live_state"
  | "pulse"
  | "question"
  | "voice"
  | "poll_response"
  | "reaction"
  | "heartbeat";

type LocaleCode = "en" | "hi" | "es";

type SessionRow = {
  id: string;
  join_code: string;
  access_token_hash: string | null;
  subject: string;
  topic: string;
  grade_class: string;
  language: string;
  status: string;
  locked_at: string | null;
};

type ClusterRow = {
  id: string;
  title: string;
  updated_at: string;
};

type PollOptionRow = {
  index?: number;
  text?: string;
  label?: string;
};

type PollRow = {
  id: string;
  session_id: string;
  question: string;
  options_json: PollOptionRow[] | string | null;
  status: string;
  updated_at: string;
  closed_at: string | null;
};

type AnnouncementRow = {
  id: string;
  session_id: string;
  title: string | null;
  body: string;
  type: string | null;
  audio_url: string | null;
  issued_at: string | null;
};

type JoinRequest = {
  action: "join";
  code?: string;
  locale?: string;
  deviceId?: string;
  platform?: string;
  sessionId?: string;
  accessToken?: string;
};

type LiveStateRequest = {
  action: "live_state";
  sessionId?: string;
};

type PulseRequest = {
  action: "pulse";
  eventId?: string;
  sessionId?: string;
  participantToken?: string;
  signal?: string;
  reason?: string;
  occurredAt?: string;
};

type QuestionRequest = {
  action: "question";
  questionId?: string;
  sessionId?: string;
  participantToken?: string;
  text?: string;
  locale?: string;
  createdAt?: string;
  reason?: string;
  transcription?: string;
};

type VoiceRequest = {
  action: "voice";
  uploadId?: string;
  sessionId?: string;
  participantToken?: string;
  locale?: string;
  createdAt?: string;
  reason?: string;
  audioBase64?: string;
  mimeType?: string;
  transcription?: string;
};

type PollResponseRequest = {
  action: "poll_response";
  responseId?: string;
  pollId?: string;
  sessionId?: string;
  participantToken?: string;
  optionId?: string;
  submittedAt?: string;
};

type ReactionRequest = {
  action: "reaction";
  reactionId?: string;
  sessionId?: string;
  participantToken?: string;
  emoji?: string;
  createdAt?: string;
};

type HeartbeatRequest = {
  action: "heartbeat";
  heartbeatId?: string;
  sessionId?: string;
  participantToken?: string;
  signalState?: string | null;
  screenTimeMs?: number;
  sentAt?: string;
};

type StudentRequest =
  | JoinRequest
  | LiveStateRequest
  | PulseRequest
  | QuestionRequest
  | VoiceRequest
  | PollResponseRequest
  | ReactionRequest
  | HeartbeatRequest;

type ParticipantTokenPayload = {
  v: 1;
  sid: string;
  aid: string;
  iat: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SESSION_TABLE = Deno.env.get("SUPABASE_SESSIONS_TABLE") ?? "sessions";
const PARTICIPANTS_TABLE =
  Deno.env.get("SUPABASE_SESSION_PARTICIPANTS_TABLE") ?? "session_participants";
const QUESTIONS_TABLE =
  Deno.env.get("SUPABASE_SESSION_QUESTIONS_TABLE") ?? "session_questions";
const PULSES_TABLE = Deno.env.get("SUPABASE_SESSION_PULSES_TABLE") ?? "session_pulses";
const POLLS_TABLE = Deno.env.get("SUPABASE_SESSION_POLLS_TABLE") ?? "session_polls";
const POLL_RESPONSES_TABLE =
  Deno.env.get("SUPABASE_POLL_RESPONSES_TABLE") ?? "poll_responses";
const ANNOUNCEMENTS_TABLE =
  Deno.env.get("SUPABASE_SESSION_ANNOUNCEMENTS_TABLE") ?? "session_announcements";
const REACTIONS_TABLE =
  Deno.env.get("SUPABASE_STUDENT_REACTIONS_TABLE") ?? "student_reactions";
const HEARTBEATS_TABLE =
  Deno.env.get("SUPABASE_STUDENT_HEARTBEATS_TABLE") ?? "student_heartbeats";
const CLUSTERS_TABLE =
  Deno.env.get("SUPABASE_MISCONCEPTION_CLUSTERS_TABLE") ?? "misconception_clusters";
const participantTokenSecret =
  Deno.env.get("STUDENT_PARTICIPANT_TOKEN_SECRET") ?? SUPABASE_SERVICE_ROLE_KEY;
const openAIKey = Deno.env.get("OPENAI_API_KEY");
const transcriptionModel = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") ?? "gpt-4o-transcribe";
const deepgramApiKey = Deno.env.get("DEEPGRAM_API_KEY");
const deepgramApiBaseUrl = Deno.env.get("DEEPGRAM_API_BASE_URL") ?? "https://api.deepgram.com/v1";
const deepgramSttModel = Deno.env.get("DEEPGRAM_STT_MODEL") ?? "nova-3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !participantTokenSecret) {
  throw new Error("Missing Supabase student backend configuration.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

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

function sanitizeText(value: unknown, maxLength: number, allowMultiline = false) {
  if (typeof value !== "string") {
    return "";
  }

  let sanitized = value
    .normalize("NFKC")
    .replace(BIDI_CONTROL_REGEX, "")
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(CONTROL_CHAR_REGEX, "")
    .replace(/\t/g, " ");

  if (!allowMultiline) {
    sanitized = sanitized.replace(/[\r\n]+/g, " ");
  }

  sanitized = allowMultiline
    ? sanitized
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : sanitized.replace(/\s+/g, " ").trim();

  return sanitized.slice(0, maxLength);
}

function sanitizeLocale(value: unknown): LocaleCode {
  const normalized = sanitizeText(value, 24).toLowerCase();
  if (normalized.startsWith("hi") || normalized.includes("hindi")) {
    return "hi";
  }
  if (normalized.startsWith("es") || normalized.includes("spanish")) {
    return "es";
  }
  return "en";
}

function sanitizeAnonymousId(value: unknown) {
  const sanitized = sanitizeText(value, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length > 0 ? sanitized : "anonymous";
}

function normalizeTeacherLanguage(value: unknown): LocaleCode {
  return sanitizeLocale(value);
}

function mapSessionStatus(session: SessionRow) {
  if (session.locked_at) {
    return "locked" as const;
  }
  if (session.status === "ended") {
    return "ended" as const;
  }
  return "active" as const;
}

function toIsoString(value?: string | null) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function bytesToBase64Url(bytes: Uint8Array) {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function base64UrlToText(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function signValue(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(participantTokenSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function createParticipantToken(sessionId: string, anonymousId: string) {
  const payload: ParticipantTokenPayload = {
    v: 1,
    sid: sessionId,
    aid: anonymousId,
    iat: new Date().toISOString(),
  };

  const encodedPayload = textToBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function verifyParticipantToken(token: string, expectedSessionId: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await signValue(encodedPayload);
  if (expectedSignature !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlToText(encodedPayload)) as ParticipantTokenPayload;
    if (payload.v !== 1 || payload.sid !== expectedSessionId || !payload.aid) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function hashIdentifier(value: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function hashSessionAccessToken(value: string) {
  return hashIdentifier(sanitizeText(value, 128));
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function getRateLimitConfig(action: StudentAction) {
  switch (action) {
    case "join":
      return { maxRequests: 8, windowSeconds: 300 };
    case "live_state":
      return { maxRequests: 60, windowSeconds: 60 };
    case "pulse":
      return { maxRequests: 24, windowSeconds: 60 };
    case "question":
      return { maxRequests: 8, windowSeconds: 60 };
    case "voice":
      return { maxRequests: 6, windowSeconds: 60 };
    case "poll_response":
      return { maxRequests: 18, windowSeconds: 60 };
    case "reaction":
      return { maxRequests: 24, windowSeconds: 60 };
    case "heartbeat":
      return { maxRequests: 24, windowSeconds: 600 };
    default:
      return { maxRequests: 10, windowSeconds: 60 };
  }
}

async function assertRateLimit(args: {
  sessionId: string;
  anonymousId: string;
  ipAddress: string;
  action: StudentAction;
}) {
  const subjectKey = await hashIdentifier(
    `${args.sessionId}:${args.anonymousId}:${args.ipAddress}:${args.action}`
  );
  const limits = getRateLimitConfig(args.action);

  const { data, error } = await supabaseAdmin.rpc("consume_session_rate_limit", {
    p_session_id: args.sessionId,
    p_subject_key: subjectKey,
    p_action: args.action,
    p_max_requests: limits.maxRequests,
    p_window_seconds: limits.windowSeconds,
  });

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    return jsonResponse(
      {
        error: "Too many requests. Please wait a moment and try again.",
        retryAfterSeconds: result?.retry_after_seconds ?? limits.windowSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result?.retry_after_seconds ?? limits.windowSeconds),
        },
      }
    );
  }

  return null;
}

async function findSessionById(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from(SESSION_TABLE)
    .select("id, join_code, access_token_hash, subject, topic, grade_class, language, status, locked_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as SessionRow | null) ?? null;
}

async function findSessionByJoinCode(joinCode: string) {
  const { data, error } = await supabaseAdmin
    .from(SESSION_TABLE)
    .select("id, join_code, access_token_hash, subject, topic, grade_class, language, status, locked_at")
    .eq("join_code", joinCode)
    .in("status", ["lobby", "active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as SessionRow | null) ?? null;
}

async function resolveJoinSession(request: JoinRequest) {
  const sessionId = sanitizeText(request.sessionId, 120);
  const joinCode = sanitizeText(request.code, 12);
  const accessToken = sanitizeText(request.accessToken, 128);

  const session = sessionId
    ? await findSessionById(sessionId)
    : joinCode
      ? await findSessionByJoinCode(joinCode)
      : null;

  if (!session) {
    return jsonResponse(
      { error: "That join code is invalid or expired." },
      { status: 400 }
    );
  }

  if (joinCode && session.join_code !== joinCode) {
    return jsonResponse(
      { error: "That join code is invalid or expired." },
      { status: 400 }
    );
  }

  if (accessToken && session.access_token_hash) {
    const providedHash = await hashSessionAccessToken(accessToken);
    if (providedHash !== session.access_token_hash) {
      return jsonResponse(
        { error: "That join code is invalid or expired." },
        { status: 400 }
      );
    }
  }

  if (session.locked_at) {
    return jsonResponse({ error: "This session is locked." }, { status: 423 });
  }

  if (session.status === "ended") {
    return jsonResponse(
      { error: "That join code is invalid or expired." },
      { status: 400 }
    );
  }

  return session;
}

function mapStudentSession(session: SessionRow) {
  return {
    sessionId: session.id,
    code: session.join_code,
    subject: session.subject,
    topic: session.topic,
    classLabel: session.grade_class,
    teacherLanguage: normalizeTeacherLanguage(session.language),
    status: mapSessionStatus(session),
    allowVoiceDoubts: true,
    allowPollAnswerChange: true,
    readAloudEnabled: true,
  };
}

async function buildAnonymousId(sessionId: string, deviceId: string) {
  const source = sanitizeText(deviceId, 160) || crypto.randomUUID();
  const hashed = await hashIdentifier(`${sessionId}:${source}`);
  return `anon_${hashed.slice(0, 20)}`;
}

async function upsertParticipantPresence(sessionId: string, anonymousId: string, source: string) {
  const timestamp = new Date().toISOString();
  const { error } = await supabaseAdmin.from(PARTICIPANTS_TABLE).upsert(
    {
      session_id: sessionId,
      anonymous_id: anonymousId,
      joined_at: timestamp,
      last_seen_at: timestamp,
      is_connected: true,
      source,
    },
    {
      onConflict: "session_id,anonymous_id",
    }
  );

  if (error) {
    throw error;
  }
}

async function resolveParticipantContext(
  sessionId: string,
  participantToken: string,
  source = "student_app"
) {
  const payload = await verifyParticipantToken(participantToken, sessionId);
  if (!payload) {
    return null;
  }

  await upsertParticipantPresence(sessionId, payload.aid, source);
  return payload;
}

async function fetchActivePoll(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from(POLLS_TABLE)
    .select("id, session_id, question, options_json, status, updated_at, closed_at")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row = data as PollRow;
  const parsedOptions = Array.isArray(row.options_json)
    ? row.options_json
    : typeof row.options_json === "string"
      ? JSON.parse(row.options_json)
      : [];

  const options = Array.isArray(parsedOptions)
    ? parsedOptions
        .map((option, index) => {
          const optionIndex =
            typeof option?.index === "number" && Number.isFinite(option.index)
              ? option.index
              : index;
          const label = sanitizeText(option?.text ?? option?.label, 120);
          if (!label) {
            return null;
          }

          return {
            optionId: String(optionIndex),
            label,
          };
        })
        .filter((option): option is { optionId: string; label: string } => Boolean(option))
    : [];

  return {
    pollId: row.id,
    sessionId: row.session_id,
    question: sanitizeText(row.question, 220),
    options,
    allowAnswerChange: true,
    allowUnsure: false,
    closesAt: row.closed_at ?? undefined,
  };
}

async function fetchTeacherPrompt(sessionId: string, locale: LocaleCode) {
  const { data, error } = await supabaseAdmin
    .from(CLUSTERS_TABLE)
    .select("id, title, updated_at")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const cluster = data as ClusterRow;
  const title = sanitizeText(cluster.title, 120);
  if (!title) {
    return null;
  }

  return {
    promptId: cluster.id,
    title: "Teacher note",
    body: `Your teacher is revisiting ${title.toLowerCase()}. Listen for the next explanation.`,
    issuedAt: toIsoString(cluster.updated_at),
    locale,
  };
}

async function fetchAnnouncementHistory(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from(ANNOUNCEMENTS_TABLE)
    .select("id, session_id, title, body, type, audio_url, issued_at")
    .eq("session_id", sessionId)
    .order("issued_at", { ascending: false })
    .limit(12);

  if (error) {
    throw error;
  }

  return ((data as AnnouncementRow[] | null) ?? []).map((row) => ({
    announcementId: row.id,
    title: sanitizeText(row.title, 80) || undefined,
    body: sanitizeText(row.body, 280),
    type: sanitizeText(row.type, 16) === "voice" ? "voice" : "text",
    audioUrl: sanitizeText(row.audio_url, 500) || undefined,
    issuedAt: toIsoString(row.issued_at),
  }));
}

async function assertSessionAcceptsWrites(sessionId: string) {
  const session = await findSessionById(sessionId);
  if (!session) {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  if (session.status === "ended") {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  if (session.locked_at) {
    return jsonResponse({ error: "Session locked." }, { status: 423 });
  }

  return session;
}

function mapPulseValue(value: unknown) {
  const normalized = sanitizeText(value, 24).toLowerCase();
  if (normalized === "got_it" || normalized === "sort_of" || normalized === "lost") {
    return normalized;
  }

  return null;
}

function mapReactionValue(value: unknown) {
  const normalized = sanitizeText(value, 32).toLowerCase();
  if (
    normalized === "thumbs_up" ||
    normalized === "lightbulb" ||
    normalized === "question" ||
    normalized === "clap"
  ) {
    return normalized;
  }

  return null;
}

function getAudioFileExtension(mimeType?: string) {
  const normalized = sanitizeText(mimeType, 40).toLowerCase();
  if (normalized.includes("webm")) {
    return "webm";
  }
  if (normalized.includes("wav")) {
    return "wav";
  }
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }
  if (normalized.includes("ogg")) {
    return "ogg";
  }
  if (normalized.includes("aac")) {
    return "aac";
  }
  return "m4a";
}

function decodeBase64(value: string) {
  const normalized = value.replace(/\s+/g, "");
  const decoded = atob(normalized);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
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
  const normalized = sanitizeText(locale, 24).toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("hi") || normalized.startsWith("en")) {
    return "multi";
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

  return sanitizeText(transcript, 220, true);
}

async function transcribeStudentVoice(args: {
  audioBase64?: string;
  mimeType?: string;
  locale?: string;
  existingText?: string;
}) {
  const existingText = sanitizeText(args.existingText, 220, true);
  if (existingText) {
    return existingText;
  }

  if (!args.audioBase64) {
    return "Voice note: Please explain that step one more time.";
  }

  if (deepgramApiKey) {
    const transcript = await transcribeWithDeepgram({
      audioBase64: args.audioBase64,
      mimeType: args.mimeType,
      locale: args.locale,
    });

    return transcript || "Voice note: Please explain that step one more time.";
  }

  if (!openAIKey) {
    return "Voice note: Please explain that step one more time.";
  }

  const audioBytes = decodeBase64(args.audioBase64);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([audioBytes], { type: args.mimeType || "audio/m4a" }),
    `student-voice.${getAudioFileExtension(args.mimeType)}`
  );
  formData.append("model", transcriptionModel);
  formData.append("response_format", "text");

  const locale = sanitizeText(args.locale, 16);
  if (locale) {
    formData.append(
      "prompt",
      `Transcribe this short student classroom question clearly in ${locale}.`
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

  const transcript = sanitizeText(await response.text(), 220, true);
  return transcript || "Voice note: Please explain that step one more time.";
}

async function handleJoin(request: JoinRequest) {
  const joinCode = sanitizeText(request.code, 12);
  if (!joinCode) {
    return jsonResponse({ error: "A 4-digit join code is required." }, { status: 400 });
  }

  const resolvedSession = await resolveJoinSession(request);
  if (resolvedSession instanceof Response) {
    return resolvedSession;
  }

  const anonymousId = await buildAnonymousId(
    resolvedSession.id,
    sanitizeText(request.deviceId, 160)
  );
  const source = `student_${sanitizeText(request.platform, 24) || "app"}`;
  await upsertParticipantPresence(resolvedSession.id, anonymousId, source);
  const participantToken = await createParticipantToken(resolvedSession.id, anonymousId);

  return jsonResponse({
    participantToken,
    session: mapStudentSession(resolvedSession),
  });
}

async function handleLiveState(request: LiveStateRequest) {
  const sessionId = sanitizeText(request.sessionId, 120);
  if (!sessionId) {
    return jsonResponse({ error: "Session ID is required." }, { status: 400 });
  }

  const session = await findSessionById(sessionId);
  if (!session) {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  const teacherLocale = normalizeTeacherLanguage(session.language);
  const [activePoll, teacherPrompt, announcements] = await Promise.all([
    fetchActivePoll(sessionId),
    fetchTeacherPrompt(sessionId, teacherLocale),
    fetchAnnouncementHistory(sessionId),
  ]);

  return jsonResponse({
    session: mapStudentSession(session),
    activePoll,
    teacherPrompt,
    announcements,
  });
}

async function handlePulse(request: PulseRequest) {
  const sessionId = sanitizeText(request.sessionId, 120);
  const participantToken = sanitizeText(request.participantToken, 512);
  const eventId = sanitizeText(request.eventId, 120) || crypto.randomUUID();
  const pulse = mapPulseValue(request.signal);

  if (!sessionId || !participantToken || !pulse) {
    return jsonResponse({ error: "Pulse event is incomplete." }, { status: 400 });
  }

  const session = await assertSessionAcceptsWrites(sessionId);
  if (session instanceof Response) {
    return session;
  }

  const participant = await resolveParticipantContext(sessionId, participantToken, "student_pulse");
  if (!participant) {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  const timestamp = toIsoString(request.occurredAt);
  const { error } = await supabaseAdmin.from(PULSES_TABLE).upsert(
    {
      id: eventId,
      session_id: sessionId,
      anonymous_id: participant.aid,
      pulse,
      timestamp,
      source: "student_app",
      reason: sanitizeText(request.reason, 40) || null,
    },
    {
      onConflict: "id",
    }
  );

  if (error) {
    throw error;
  }

  return jsonResponse({ ok: true });
}

async function handleQuestion(request: QuestionRequest) {
  const sessionId = sanitizeText(request.sessionId, 120);
  const participantToken = sanitizeText(request.participantToken, 512);
  const questionId = sanitizeText(request.questionId, 120) || crypto.randomUUID();
  const text = sanitizeText(request.transcription || request.text, 220, true);

  if (!sessionId || !participantToken || !text) {
    return jsonResponse({ error: "Question text is required." }, { status: 400 });
  }

  const session = await assertSessionAcceptsWrites(sessionId);
  if (session instanceof Response) {
    return session;
  }

  const participant = await resolveParticipantContext(
    sessionId,
    participantToken,
    "student_question"
  );
  if (!participant) {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  const timestamp = toIsoString(request.createdAt);
  const { error } = await supabaseAdmin.from(QUESTIONS_TABLE).upsert(
    {
      id: questionId,
      session_id: sessionId,
      anonymous_id: participant.aid,
      text,
      language: sanitizeLocale(request.locale),
      lesson_marker_id: null,
      timestamp,
      reason: sanitizeText(request.reason, 40) || null,
    },
    {
      onConflict: "id",
    }
  );

  if (error) {
    throw error;
  }

  return jsonResponse({ ok: true, questionId, queuedAt: timestamp });
}

async function handleVoice(request: VoiceRequest) {
  const sessionId = sanitizeText(request.sessionId, 120);
  const participantToken = sanitizeText(request.participantToken, 512);
  const uploadId = sanitizeText(request.uploadId, 120) || crypto.randomUUID();

  if (!sessionId || !participantToken) {
    return jsonResponse({ error: "Voice upload is incomplete." }, { status: 400 });
  }

  const session = await assertSessionAcceptsWrites(sessionId);
  if (session instanceof Response) {
    return session;
  }

  const participant = await resolveParticipantContext(sessionId, participantToken, "student_voice");
  if (!participant) {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  const transcription = await transcribeStudentVoice({
    audioBase64: sanitizeText(request.audioBase64, 4_000_000),
    mimeType: sanitizeText(request.mimeType, 40),
    locale: sanitizeLocale(request.locale),
    existingText: request.transcription,
  });

  const timestamp = toIsoString(request.createdAt);
  const { error } = await supabaseAdmin.from(QUESTIONS_TABLE).upsert(
    {
      id: uploadId,
      session_id: sessionId,
      anonymous_id: participant.aid,
      text: transcription,
      language: sanitizeLocale(request.locale),
      lesson_marker_id: null,
      timestamp,
      reason: sanitizeText(request.reason, 40) || null,
    },
    {
      onConflict: "id",
    }
  );

  if (error) {
    throw error;
  }

  return jsonResponse({ ok: true, questionId: uploadId, queuedAt: timestamp });
}

async function handlePollResponse(request: PollResponseRequest) {
  const sessionId = sanitizeText(request.sessionId, 120);
  const participantToken = sanitizeText(request.participantToken, 512);
  const responseId = sanitizeText(request.responseId, 120) || crypto.randomUUID();
  const pollId = sanitizeText(request.pollId, 120);
  const optionId = sanitizeText(request.optionId, 20);

  if (!sessionId || !participantToken || !pollId || !optionId) {
    return jsonResponse({ error: "Poll response is incomplete." }, { status: 400 });
  }

  const session = await assertSessionAcceptsWrites(sessionId);
  if (session instanceof Response) {
    return session;
  }

  const participant = await resolveParticipantContext(
    sessionId,
    participantToken,
    "student_poll"
  );
  if (!participant) {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  const activePoll = await fetchActivePoll(sessionId);
  if (!activePoll || activePoll.pollId !== pollId) {
    return jsonResponse({ error: "Poll not found." }, { status: 404 });
  }

  const optionIndex = Number(optionId);
  if (!Number.isInteger(optionIndex)) {
    return jsonResponse({ error: "Invalid poll option." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from(POLL_RESPONSES_TABLE).upsert(
    {
      id: responseId,
      poll_id: pollId,
      session_id: sessionId,
      anonymous_id: participant.aid,
      option_index: optionIndex,
      submitted_at: toIsoString(request.submittedAt),
    },
    {
      onConflict: "id",
    }
  );

  if (error) {
    throw error;
  }

  return jsonResponse({ ok: true });
}

async function handleReaction(request: ReactionRequest) {
  const sessionId = sanitizeText(request.sessionId, 120);
  const participantToken = sanitizeText(request.participantToken, 512);
  const reactionId = sanitizeText(request.reactionId, 120) || crypto.randomUUID();
  const emoji = mapReactionValue(request.emoji);

  if (!sessionId || !participantToken || !emoji) {
    return jsonResponse({ error: "Reaction is incomplete." }, { status: 400 });
  }

  const session = await assertSessionAcceptsWrites(sessionId);
  if (session instanceof Response) {
    return session;
  }

  const participant = await resolveParticipantContext(
    sessionId,
    participantToken,
    "student_reaction"
  );
  if (!participant) {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from(REACTIONS_TABLE).upsert(
    {
      id: reactionId,
      session_id: sessionId,
      anonymous_id: participant.aid,
      emoji,
      created_at: toIsoString(request.createdAt),
    },
    {
      onConflict: "id",
    }
  );

  if (error) {
    throw error;
  }

  return jsonResponse({ ok: true, reactionId });
}

async function handleHeartbeat(request: HeartbeatRequest) {
  const sessionId = sanitizeText(request.sessionId, 120);
  const participantToken = sanitizeText(request.participantToken, 512);
  const heartbeatId =
    sanitizeText(request.heartbeatId, 120) || crypto.randomUUID();
  const signalState =
    request.signalState == null ? null : mapPulseValue(request.signalState);
  const screenTimeMs =
    typeof request.screenTimeMs === "number" && Number.isFinite(request.screenTimeMs)
      ? Math.max(Math.round(request.screenTimeMs), 0)
      : 0;

  if (!sessionId || !participantToken) {
    return jsonResponse({ error: "Heartbeat is incomplete." }, { status: 400 });
  }

  const session = await assertSessionAcceptsWrites(sessionId);
  if (session instanceof Response) {
    return session;
  }

  const participant = await resolveParticipantContext(
    sessionId,
    participantToken,
    "student_heartbeat"
  );
  if (!participant) {
    return jsonResponse({ error: "Session not found." }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from(HEARTBEATS_TABLE).upsert(
    {
      id: heartbeatId,
      session_id: sessionId,
      anonymous_id: participant.aid,
      signal_state: signalState,
      screen_time_ms: screenTimeMs,
      sent_at: toIsoString(request.sentAt),
    },
    {
      onConflict: "id",
    }
  );

  if (error) {
    throw error;
  }

  return jsonResponse({ ok: true, heartbeatId });
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const body = (await request.json()) as Partial<StudentRequest>;
    const action = sanitizeText(body.action, 40) as StudentAction;

    if (
      action !== "join" &&
      action !== "live_state" &&
      action !== "pulse" &&
      action !== "question" &&
      action !== "voice" &&
      action !== "poll_response" &&
      action !== "reaction" &&
      action !== "heartbeat"
    ) {
      return jsonResponse({ error: "Invalid action." }, { status: 400 });
    }

    const sessionId = sanitizeText((body as { sessionId?: unknown }).sessionId, 120);
    const joinCode = sanitizeText((body as { code?: unknown }).code, 12);
    const anonymousBase =
      sanitizeText((body as { deviceId?: unknown }).deviceId, 160) ||
      sanitizeText((body as { participantToken?: unknown }).participantToken, 160) ||
      "anonymous";
    const ipAddress = getClientIp(request);
    const resolvedRateLimitSessionId = sessionId || (action === "join" ? "join_lookup" : "unknown");
    const rateLimitResponse = await assertRateLimit({
      sessionId: resolvedRateLimitSessionId === "join_lookup" ? joinCode || "join_lookup" : resolvedRateLimitSessionId,
      anonymousId: sanitizeAnonymousId(anonymousBase),
      ipAddress,
      action,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (action === "join") {
      return await handleJoin(body as JoinRequest);
    }

    if (action === "live_state") {
      return await handleLiveState(body as LiveStateRequest);
    }

    if (action === "pulse") {
      return await handlePulse(body as PulseRequest);
    }

    if (action === "question") {
      return await handleQuestion(body as QuestionRequest);
    }

    if (action === "voice") {
      return await handleVoice(body as VoiceRequest);
    }

    if (action === "reaction") {
      return await handleReaction(body as ReactionRequest);
    }

    if (action === "heartbeat") {
      return await handleHeartbeat(body as HeartbeatRequest);
    }

    return await handlePollResponse(body as PollResponseRequest);
  } catch (error) {
    console.error("student-session-access failed", error);
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "The request could not be completed right now.",
      },
      { status: 500 }
    );
  }
});
