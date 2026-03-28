do $$
begin
  alter publication supabase_realtime add table public.session_questions;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.misconception_clusters;
exception
  when duplicate_object then null;
end
$$;
