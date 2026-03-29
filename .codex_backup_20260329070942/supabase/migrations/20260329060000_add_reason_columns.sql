-- Phase 1: Add dedicated reason column to session_pulses and session_questions
-- Previously, reason was incorrectly stored in the source column of session_pulses
-- and dropped entirely from session_questions.

ALTER TABLE session_pulses ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE session_questions ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE INDEX IF NOT EXISTS idx_session_pulses_reason
  ON session_pulses(session_id, reason) WHERE reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_questions_reason
  ON session_questions(session_id, reason) WHERE reason IS NOT NULL;

-- Phase 3: Announcements table
CREATE TABLE IF NOT EXISTS session_announcements (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  audio_url TEXT,
  issued_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_session
  ON session_announcements(session_id, issued_at DESC);

-- Phase 5: Student reactions table
CREATE TABLE IF NOT EXISTS student_reactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reactions_session
  ON student_reactions(session_id, created_at DESC);

-- Phase 6: Student heartbeats table
CREATE TABLE IF NOT EXISTS student_heartbeats (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  signal_state TEXT,
  screen_time_ms INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_session
  ON student_heartbeats(session_id, sent_at DESC);

-- Phase 8: Gamification tables
CREATE TABLE IF NOT EXISTS gamification_points (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  action TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_streaks (
  anonymous_id TEXT PRIMARY KEY,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_session_date DATE,
  total_points INTEGER DEFAULT 0,
  badges JSONB DEFAULT '[]'
);

-- Add new tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE session_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE student_reactions;
