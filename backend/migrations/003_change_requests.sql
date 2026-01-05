
create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  target_type text not null check (target_type in ('contact', 'service')),
  target_id uuid not null,
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add is_archived to contacts
alter table public.contacts add column if not exists is_archived boolean default false;
alter table public.contacts add column if not exists org_id uuid references auth.users(id); -- assuming org_id logic or we use user_id mapping
-- Actually, user_id is the tenant owner in strict RLS, so 'org_id' might be redundant if we just check user_id. 
-- But admin.py used 'org_id'. I will assume for MVP user_id IS the org_id context or we add it. 
-- Let's just adding is_archived.

-- Merge Audit Log
create table if not exists public.merge_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid, -- nullable if not using orgs strictly yet
  user_id uuid,
  primary_contact_id uuid,
  merged_contact_ids uuid[],
  timestamp timestamptz default now(),
  details jsonb
);

-- RLS
alter table public.change_requests enable row level security;

create policy "Users can see their own requests"
on public.change_requests for select
using (auth.uid() = user_id);

create policy "Users can create requests"
on public.change_requests for insert
with check (auth.uid() = user_id);

-- Admin policy: relying on service role for admin ops, or we add one if needed.
-- create policy "Admins can do all" ... (omitted for MVP, backend uses service role)
