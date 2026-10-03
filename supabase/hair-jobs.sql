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

-- Encrypted key storage for the site owner's setup screen.
create extension if not exists supabase_vault with schema vault;
create or replace function public.hair_set_api_key(p_key text)
returns void language plpgsql security definer set search_path = public, vault
as $$
declare v_id uuid;
begin
  if p_key is null or p_key !~ '^[^:[:space:]]+:[^:[:space:]]+$' or length(p_key) > 512 then
    raise exception 'Invalid Higgsfield key format';
  end if;
  select id into v_id from vault.secrets where name = 'lukemodel_higgsfield_api_key';
  if v_id is null then
    perform vault.create_secret(p_key, 'lukemodel_higgsfield_api_key', 'lukemodel hair studio');
  else
    perform vault.update_secret(v_id, p_key);
  end if;
end;
$$;
create or replace function public.hair_get_api_key()
returns text language sql security definer set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'lukemodel_higgsfield_api_key' limit 1;
$$;
revoke all on function public.hair_set_api_key(text) from public, anon, authenticated;
revoke all on function public.hair_get_api_key() from public, anon, authenticated;
grant execute on function public.hair_set_api_key(text) to service_role;
grant execute on function public.hair_get_api_key() to service_role;
