create table if not exists public.session_summaries (
  id text primary key,
  session_id text not null unique,
  teacher_id text,
  subject text not null,
  topic text not null,
  grade_class text not null,
  duration integer not null default 0,
  participant_count integer not null default 0,
  recovery_score double precision not null default 0,
  summary_source text not null default 'fallback',
  ai_narrative_summary text,
  suggested_next_activity text,
  voice_reflection_uri text,
  voice_reflection_transcript text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_session_summaries_teacher_created
  on public.session_summaries (teacher_id, created_at desc);

create index if not exists idx_session_summaries_topic
  on public.session_summaries (topic);
