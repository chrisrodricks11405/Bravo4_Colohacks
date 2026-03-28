create table if not exists public.session_polls (
  id text primary key,
  session_id text not null,
  question text not null,
  options_json jsonb not null default '[]'::jsonb,
  correct_option_index integer,
  source text not null default 'manual',
  cluster_id text,
  cluster_title text,
  rationale text,
  status text not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  pushed_at timestamptz,
  closed_at timestamptz
);

create index if not exists idx_session_polls_session_updated
  on public.session_polls (session_id, updated_at desc);

create table if not exists public.poll_responses (
  id text primary key,
  poll_id text not null,
  session_id text not null,
  anonymous_id text not null,
  option_index integer not null,
  submitted_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_poll_responses_poll_time
  on public.poll_responses (poll_id, submitted_at desc);

create index if not exists idx_poll_responses_session_time
  on public.poll_responses (session_id, submitted_at desc);

do $$
begin
  alter publication supabase_realtime add table public.session_polls;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.poll_responses;
exception
  when duplicate_object then null;
end
$$;
