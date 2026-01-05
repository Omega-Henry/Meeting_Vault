
-- Ensure extensions
create extension if not exists "pgcrypto";

-- 1. Create change_requests if not exists
create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  target_type text not null check (target_type in ('contact', 'service')),
  target_id uuid not null,
  changes jsonb not null,
  summary text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure columns exist (idempotent fix)
alter table public.change_requests add column if not exists user_id uuid references auth.users(id);
alter table public.change_requests add column if not exists summary text;

-- 2. Add columns to contacts
alter table public.contacts add column if not exists is_archived boolean default false;
alter table public.contacts add column if not exists org_id uuid references auth.users(id);

-- 3. Create merge_audit_log
create table if not exists public.merge_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid, 
  user_id uuid,
  primary_contact_id uuid,
  merged_contact_ids uuid[],
  timestamp timestamptz default now(),
  details jsonb
);

-- 4. Enable RLS
alter table public.change_requests enable row level security;

-- 5. Policies (drop first to ensure update)
drop policy if exists "Users can see their own requests" on public.change_requests;
create policy "Users can see their own requests"
on public.change_requests for select
using (auth.uid() = user_id);

drop policy if exists "Users can create requests" on public.change_requests;
create policy "Users can create requests"
on public.change_requests for insert
with check (auth.uid() = user_id);
