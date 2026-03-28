create extension if not exists vector;

create table if not exists public.session_questions (
  id text primary key,
  session_id text not null,
  anonymous_id text not null,
  text text not null,
  language text,
  lesson_marker_id text,
  embedding vector(1536),
  timestamp timestamptz not null default timezone('utc', now())
);

create index if not exists idx_session_questions_session_time
  on public.session_questions (session_id, timestamp desc);

create index if not exists idx_session_questions_embedding
  on public.session_questions
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists public.misconception_clusters (
  id text primary key,
  session_id text not null,
  title text not null,
  summary text not null,
  affected_count integer not null default 0,
  representative_question text not null,
  reason_chip text not null default 'other',
  lesson_marker_id text,
  translation text,
  keyword_anchors jsonb not null default '[]'::jsonb,
  latest_question_at timestamptz,
  source text not null default 'ai',
  status text not null default 'active',
  suggested_interventions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_misconception_clusters_session_updated
  on public.misconception_clusters (session_id, updated_at desc);

create or replace function public.match_question_neighbors(
  target_session_id text,
  target_embedding vector(1536),
  similarity_threshold float default 0.78,
  max_matches integer default 18
)
returns table (
  id text,
  session_id text,
  anonymous_id text,
  text text,
  language text,
  lesson_marker_id text,
  "timestamp" timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    q.id,
    q.session_id,
    q.anonymous_id,
    q.text,
    q.language,
    q.lesson_marker_id,
    q.timestamp as "timestamp",
    1 - (q.embedding <=> target_embedding) as similarity
  from public.session_questions q
  where q.session_id = target_session_id
    and q.embedding is not null
    and 1 - (q.embedding <=> target_embedding) >= similarity_threshold
  order by q.embedding <=> target_embedding
  limit greatest(max_matches, 1);
$$;
