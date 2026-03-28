create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id text primary key,
  teacher_id text not null,
  join_code text not null,
  qr_payload text not null,
  access_token_hash text,
  subject text not null,
  topic text not null,
  grade_class text not null,
  language text not null,
  lost_threshold double precision not null default 40,
  mode text not null default 'online',
  lesson_plan_seed text,
  status text not null default 'lobby',
  participant_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  ended_at timestamptz,
  locked_at timestamptz
);

alter table if exists public.sessions
  add column if not exists access_token_hash text;

create unique index if not exists idx_sessions_join_code_active
  on public.sessions (join_code)
  where status in ('lobby', 'active');

create index if not exists idx_sessions_teacher_created
  on public.sessions (teacher_id, created_at desc);

create table if not exists public.session_participants (
  id bigint generated always as identity primary key,
  session_id text not null,
  anonymous_id text not null,
  joined_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  is_connected boolean not null default true,
  source text not null default 'student_api',
  unique (session_id, anonymous_id)
);

create index if not exists idx_session_participants_session
  on public.session_participants (session_id, last_seen_at desc);

create table if not exists public.session_api_rate_limits (
  session_id text not null,
  subject_key text not null,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, subject_key, action, window_started_at)
);

create index if not exists idx_session_api_rate_limits_updated
  on public.session_api_rate_limits (updated_at desc);

create or replace function public.hash_session_access_token(input text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(coalesce(input, ''), 'utf8'), 'sha256'), 'hex');
$$;

create or replace function public.teacher_owns_session(target_session_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = target_session_id
      and s.teacher_id::text = auth.uid()::text
  );
$$;

create or replace function public.validate_session_api_access(
  p_session_id text,
  p_join_code text,
  p_access_token text,
  p_action text default 'join'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.join_code = p_join_code
      and coalesce(s.access_token_hash, '') <> ''
      and s.access_token_hash = public.hash_session_access_token(p_access_token)
      and case
        when p_action = 'join' then s.status = 'lobby' and s.locked_at is null
        when p_action = 'question' then s.status in ('active', 'paused')
        when p_action = 'pulse' then s.status in ('active', 'paused')
        else false
      end
  );
$$;

create or replace function public.consume_session_rate_limit(
  p_session_id text,
  p_subject_key text,
  p_action text,
  p_max_requests integer,
  p_window_seconds integer default 60
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  request_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_window_seconds integer := greatest(coalesce(p_window_seconds, 60), 1);
  effective_max_requests integer := greatest(coalesce(p_max_requests, 1), 1);
  current_window timestamptz :=
    to_timestamp(
      floor(extract(epoch from timezone('utc', now())) / effective_window_seconds) *
      effective_window_seconds
    );
  next_count integer;
begin
  insert into public.session_api_rate_limits (
    session_id,
    subject_key,
    action,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_session_id,
    left(coalesce(p_subject_key, 'unknown'), 120),
    left(coalesce(p_action, 'unknown'), 32),
    current_window,
    1,
    timezone('utc', now())
  )
  on conflict (session_id, subject_key, action, window_started_at)
  do update
    set request_count = public.session_api_rate_limits.request_count + 1,
        updated_at = excluded.updated_at
  returning public.session_api_rate_limits.request_count into next_count;

  return query
  select
    next_count <= effective_max_requests,
    case
      when next_count <= effective_max_requests then 0
      else effective_window_seconds
    end,
    next_count;
end;
$$;

create or replace function public.sync_session_participant_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session_id text := coalesce(new.session_id, old.session_id);
begin
  update public.sessions
  set participant_count = (
    select count(*)
    from public.session_participants participants
    where participants.session_id = target_session_id
      and participants.is_connected = true
  )
  where id = target_session_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_session_participant_count on public.session_participants;

create trigger trg_sync_session_participant_count
after insert or update or delete on public.session_participants
for each row
execute function public.sync_session_participant_count();

revoke all on function public.hash_session_access_token(text) from public;
revoke all on function public.teacher_owns_session(text) from public;
revoke all on function public.validate_session_api_access(text, text, text, text) from public;
revoke all on function public.consume_session_rate_limit(text, text, text, integer, integer) from public;
revoke all on function public.sync_session_participant_count() from public;

grant execute on function public.teacher_owns_session(text) to authenticated;
grant execute on function public.validate_session_api_access(text, text, text, text) to service_role;
grant execute on function public.consume_session_rate_limit(text, text, text, integer, integer) to service_role;

alter table if exists public.sessions enable row level security;
alter table if exists public.session_participants enable row level security;
alter table if exists public.session_pulses enable row level security;
alter table if exists public.session_questions enable row level security;
alter table if exists public.misconception_clusters enable row level security;
alter table if exists public.session_interventions enable row level security;
alter table if exists public.session_lesson_markers enable row level security;
alter table if exists public.session_polls enable row level security;
alter table if exists public.poll_responses enable row level security;
alter table if exists public.session_summaries enable row level security;
alter table if exists public.recent_sessions enable row level security;

drop policy if exists teacher_manage_own_sessions on public.sessions;
create policy teacher_manage_own_sessions
  on public.sessions
  for all
  to authenticated
  using (teacher_id::text = auth.uid()::text)
  with check (teacher_id::text = auth.uid()::text);

drop policy if exists teacher_manage_own_participants on public.session_participants;
create policy teacher_manage_own_participants
  on public.session_participants
  for all
  to authenticated
  using (public.teacher_owns_session(session_id))
  with check (public.teacher_owns_session(session_id));

drop policy if exists teacher_manage_own_pulses on public.session_pulses;
create policy teacher_manage_own_pulses
  on public.session_pulses
  for all
  to authenticated
  using (public.teacher_owns_session(session_id))
  with check (public.teacher_owns_session(session_id));

drop policy if exists teacher_manage_own_questions on public.session_questions;
create policy teacher_manage_own_questions
  on public.session_questions
  for all
  to authenticated
  using (public.teacher_owns_session(session_id))
  with check (public.teacher_owns_session(session_id));

drop policy if exists teacher_manage_own_clusters on public.misconception_clusters;
create policy teacher_manage_own_clusters
  on public.misconception_clusters
  for all
  to authenticated
  using (public.teacher_owns_session(session_id))
  with check (public.teacher_owns_session(session_id));

drop policy if exists teacher_manage_own_interventions on public.session_interventions;
create policy teacher_manage_own_interventions
  on public.session_interventions
  for all
  to authenticated
  using (public.teacher_owns_session(session_id))
  with check (public.teacher_owns_session(session_id));

drop policy if exists teacher_manage_own_markers on public.session_lesson_markers;
create policy teacher_manage_own_markers
  on public.session_lesson_markers
  for all
  to authenticated
  using (public.teacher_owns_session(session_id))
  with check (public.teacher_owns_session(session_id));

drop policy if exists teacher_manage_own_polls on public.session_polls;
create policy teacher_manage_own_polls
  on public.session_polls
  for all
  to authenticated
  using (public.teacher_owns_session(session_id))
  with check (public.teacher_owns_session(session_id));

drop policy if exists teacher_manage_own_poll_responses on public.poll_responses;
create policy teacher_manage_own_poll_responses
  on public.poll_responses
  for all
  to authenticated
  using (public.teacher_owns_session(session_id))
  with check (public.teacher_owns_session(session_id));

drop policy if exists teacher_manage_own_summaries on public.session_summaries;
create policy teacher_manage_own_summaries
  on public.session_summaries
  for all
  to authenticated
  using (teacher_id::text = auth.uid()::text)
  with check (teacher_id::text = auth.uid()::text);

drop policy if exists teacher_manage_own_recent_sessions on public.recent_sessions;
create policy teacher_manage_own_recent_sessions
  on public.recent_sessions
  for all
  to authenticated
  using (teacher_id::text = auth.uid()::text)
  with check (teacher_id::text = auth.uid()::text);

do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.session_participants;
exception
  when duplicate_object then null;
end
$$;
