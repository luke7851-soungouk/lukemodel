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

create or replace function public.reserve_hair_job(p_user_id uuid, p_daily_limit integer)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if (select count(*) from public.hair_jobs
      where user_id = p_user_id and status <> 'failed'
      and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= p_daily_limit then
    return null;
  end if;
  insert into public.hair_jobs(user_id) values (p_user_id) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reserve_hair_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_hair_job(uuid, integer) to service_role;
