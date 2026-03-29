import { hasSupabaseConfig, supabase } from "../lib/supabase";

export interface StudentAnnouncementBroadcast {
  announcementId: string;
  title?: string;
  body: string;
  type: "text" | "voice";
  audioUrl?: string;
  issuedAt: string;
}

export interface TeacherPromptBroadcast {
  promptId: string;
  title: string;
  body: string;
  issuedAt: string;
  locale?: string;
}

export interface SessionStatusBroadcast {
  sessionId: string;
  status: "active" | "locked" | "ended";
}

async function sendBroadcast(
  sessionId: string,
  event:
    | "announcement"
    | "teacher_prompt"
    | "teacher_prompt_clear"
    | "session_status"
    | "gamification_update",
  payload: unknown
) {
  if (!hasSupabaseConfig) {
    return;
  }

  const channel = supabase.channel(`session-live:${sessionId}`, {
    config: {
      broadcast: {
        ack: true,
        self: true,
      },
    },
  });

  try {
    await channel.httpSend(event, payload);
  } finally {
    void supabase.removeChannel(channel);
  }
}

export async function broadcastAnnouncement(
  sessionId: string,
  payload: StudentAnnouncementBroadcast
) {
  await sendBroadcast(sessionId, "announcement", payload);
}

export async function broadcastTeacherPrompt(
  sessionId: string,
  payload: TeacherPromptBroadcast
) {
  await sendBroadcast(sessionId, "teacher_prompt", payload);
}

export async function broadcastTeacherPromptClear(sessionId: string) {
  await sendBroadcast(sessionId, "teacher_prompt_clear", {
    sessionId,
    clearedAt: new Date().toISOString(),
  });
}

export async function broadcastSessionStatus(
  sessionId: string,
  payload: SessionStatusBroadcast
) {
  await sendBroadcast(sessionId, "session_status", payload);
}
