-- Apply in the existing Supabase project's SQL Editor before deploying hair-generate.
create table if not exists public.hair_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text,
  status text not null default 'reserved',
  result_url text,
  created_at timestamptz not null default now()
);
create index if not exists hair_jobs_user_created_idx on public.hair_jobs(user_id, created_at desc);
alter table public.hair_jobs enable row level security;
revoke all on public.hair_jobs from anon, authenticated;

drop function if exists public.reserve_hair_job(uuid, integer);
create or replace function public.reserve_hair_job(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  -- No daily quota: only prevent the same member from starting overlapping jobs.
  if exists (select 1 from public.hair_jobs
      where user_id = p_user_id and status in ('reserved', 'submitted')
      and created_at > now() - interval '15 minutes') then
    return null;
  end if;
  insert into public.hair_jobs(user_id) values (p_user_id) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reserve_hair_job(uuid) from public, anon, authenticated;
grant execute on function public.reserve_hair_job(uuid) to service_role;
