create table if not exists public.session_pulses (
  id text primary key,
  session_id text not null,
  anonymous_id text not null,
  pulse text not null,
  timestamp timestamptz not null default timezone('utc', now()),
  source text not null default 'local_hotspot'
);

create index if not exists idx_session_pulses_session_time
  on public.session_pulses (session_id, timestamp desc);

create table if not exists public.session_lesson_markers (
  id text primary key,
  session_id text not null,
  type text not null,
  label text,
  timestamp timestamptz not null default timezone('utc', now())
);

create index if not exists idx_session_lesson_markers_session_time
  on public.session_lesson_markers (session_id, timestamp desc);

create table if not exists public.recent_sessions (
  id text primary key,
  teacher_id text,
  subject text not null,
  topic text not null,
  grade_class text not null,
  status text not null default 'ended',
  participant_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  confusion_index_avg double precision,
  synced boolean not null default true
);

create index if not exists idx_recent_sessions_teacher_created
  on public.recent_sessions (teacher_id, created_at desc);

do $$
begin
  alter publication supabase_realtime add table public.session_pulses;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.session_lesson_markers;
exception
  when duplicate_object then null;
end
$$;
