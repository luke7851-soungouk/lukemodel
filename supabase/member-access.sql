-- Membership stays open; downloading and using site assets require owner approval.
create table if not exists public.member_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  resource_type text not null default 'all',
  resource_id text not null default '*',
  purpose text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(user_id, resource_type, resource_id)
);
create index if not exists member_access_requests_status_created_idx
  on public.member_access_requests(status, created_at desc);
alter table public.member_access_requests enable row level security;
revoke all on public.member_access_requests from anon, authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default '기타',
  description text not null default '',
  image_url text not null,
  created_at timestamptz not null default now()
);
create index if not exists products_created_at_idx on public.products(created_at desc);
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;
