import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

type StudentAction = "join" | "question";

interface StudentJoinRequest {
  action: "join";
  sessionId: string;
  joinCode: string;
  accessToken: string;
  anonymousId: string;
}

interface StudentQuestionRequest {
  action: "question";
  sessionId: string;
  joinCode: string;
  accessToken: string;
  anonymousId: string;
  text: string;
  language?: string;
  lessonMarkerId?: string;
}

type StudentRequest = StudentJoinRequest | StudentQuestionRequest;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SESSION_TABLE = Deno.env.get("SUPABASE_SESSIONS_TABLE") ?? "sessions";
const PARTICIPANTS_TABLE =
  Deno.env.get("SUPABASE_SESSION_PARTICIPANTS_TABLE") ?? "session_participants";
const QUESTIONS_TABLE =
  Deno.env.get("SUPABASE_SESSION_QUESTIONS_TABLE") ?? "session_questions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase service role configuration.");
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

function sanitizeAnonymousId(value: unknown) {
  const sanitized = sanitizeText(value, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length > 0 ? sanitized : "anonymous";
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

async function assertRateLimit(args: {
  sessionId: string;
  anonymousId: string;
  ipAddress: string;
  action: StudentAction;
}) {
  const subjectKey = await hashIdentifier(
    `${args.sessionId}:${args.anonymousId}:${args.ipAddress}:${args.action}`
  );
  const limits =
    args.action === "join"
      ? { maxRequests: 8, windowSeconds: 300 }
      : { maxRequests: 6, windowSeconds: 60 };

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

async function assertSessionAccess(request: StudentRequest, action: StudentAction) {
  const { data, error } = await supabaseAdmin.rpc("validate_session_api_access", {
    p_session_id: request.sessionId,
    p_join_code: request.joinCode,
    p_access_token: request.accessToken,
    p_action: action,
  });

  if (error) {
    throw error;
  }

  if (!data) {
    return jsonResponse(
      {
        error:
          action === "join"
            ? "This session is not accepting new joins."
            : "This session is not accepting questions right now.",
      },
      { status: 403 }
    );
  }

  return null;
}

async function handleJoin(request: StudentJoinRequest) {
  const anonymousId = sanitizeAnonymousId(request.anonymousId);
  const timestamp = new Date().toISOString();

  const { error: participantError } = await supabaseAdmin
    .from(PARTICIPANTS_TABLE)
    .upsert(
      {
        session_id: request.sessionId,
        anonymous_id: anonymousId,
        joined_at: timestamp,
        last_seen_at: timestamp,
        is_connected: true,
        source: "student_api",
      },
      {
        onConflict: "session_id,anonymous_id",
      }
    );

  if (participantError) {
    throw participantError;
  }

  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from(SESSION_TABLE)
    .select("id, subject, topic, grade_class, language, status")
    .eq("id", request.sessionId)
    .maybeSingle();

  if (sessionError) {
    throw sessionError;
  }

  return jsonResponse({
    ok: true,
    session: sessionData,
    joinedAt: timestamp,
  });
}

async function handleQuestion(request: StudentQuestionRequest) {
  const anonymousId = sanitizeAnonymousId(request.anonymousId);
  const text = sanitizeText(request.text, 280, true);

  if (!text) {
    return jsonResponse(
      {
        error: "Question text is required.",
      },
      { status: 400 }
    );
  }

  const timestamp = new Date().toISOString();
  const questionId = crypto.randomUUID();

  const { error } = await supabaseAdmin.from(QUESTIONS_TABLE).insert({
    id: questionId,
    session_id: request.sessionId,
    anonymous_id: anonymousId,
    text,
    language: sanitizeText(request.language, 24) || null,
    lesson_marker_id: sanitizeText(request.lessonMarkerId, 120) || null,
    timestamp,
  });

  if (error) {
    throw error;
  }

  const { error: participantError } = await supabaseAdmin
    .from(PARTICIPANTS_TABLE)
    .upsert(
      {
        session_id: request.sessionId,
        anonymous_id: anonymousId,
        joined_at: timestamp,
        last_seen_at: timestamp,
        is_connected: true,
        source: "student_api",
      },
      {
        onConflict: "session_id,anonymous_id",
      }
    );

  if (participantError) {
    throw participantError;
  }

  return jsonResponse({
    ok: true,
    questionId,
    queuedAt: timestamp,
  });
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

    if (!body.action || (body.action !== "join" && body.action !== "question")) {
      return jsonResponse({ error: "Invalid action." }, { status: 400 });
    }

    const normalizedRequest = {
      ...body,
      sessionId: sanitizeText(body.sessionId, 120),
      joinCode: sanitizeText(body.joinCode, 12),
      accessToken: sanitizeText(body.accessToken, 128),
      anonymousId: sanitizeAnonymousId(body.anonymousId),
    } as StudentRequest;

    if (
      !normalizedRequest.sessionId ||
      !normalizedRequest.joinCode ||
      !normalizedRequest.accessToken
    ) {
      return jsonResponse({ error: "Session credentials are required." }, { status: 400 });
    }

    const ipAddress = getClientIp(request);
    const rateLimitResponse = await assertRateLimit({
      sessionId: normalizedRequest.sessionId,
      anonymousId: normalizedRequest.anonymousId,
      ipAddress,
      action: normalizedRequest.action,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const accessResponse = await assertSessionAccess(
      normalizedRequest,
      normalizedRequest.action
    );

    if (accessResponse) {
      return accessResponse;
    }

    if (normalizedRequest.action === "join") {
      return await handleJoin(normalizedRequest);
    }

    return await handleQuestion(normalizedRequest);
  } catch (error) {
    console.error("student-session-access failed", error);
    return jsonResponse(
      {
        error: "The request could not be completed right now.",
      },
      { status: 500 }
    );
  }
});
