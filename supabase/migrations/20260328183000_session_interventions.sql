create table if not exists public.session_interventions (
  id text primary key,
  session_id text not null,
  type text not null,
  cluster_id text,
  lesson_marker_id text,
  timestamp timestamptz not null default timezone('utc', now()),
  confusion_before double precision not null default 0,
  confusion_after double precision,
  recovery_score double precision,
  recovery_window_seconds integer not null default 60,
  duration_seconds integer,
  notes text
);

create index if not exists idx_session_interventions_session_time
  on public.session_interventions (session_id, timestamp desc);

do $$
begin
  alter publication supabase_realtime add table public.session_interventions;
exception
  when duplicate_object then null;
end
$$;
