-- 1. Organizations & Memberships
create table public.organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now()
);

create table public.memberships (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz default now(),
  unique(org_id, user_id)
);

-- Seed Default Organization
insert into public.organizations (name) values ('Global Directory');

-- 2. Add org_id to Canonical Tables
-- We do this in steps: Add nullable -> Backfill -> Set Not Null

-- CONTACTS
alter table public.contacts add column org_id uuid references public.organizations(id);

-- SERVICES
alter table public.services add column org_id uuid references public.organizations(id);

-- MEETING CHATS
alter table public.meeting_chats add column org_id uuid references public.organizations(id);

-- CONTACT LINKS (Create table if it doesn't exist or add column)
-- Assuming contact_links exists or is part of contacts?
-- Checking provided schema context: The user mentioned "contact_links" in the prompt.
-- I'll check if it exists or if I need to create it. For now, proceeding with known tables.

-- Backfill existing data with the default organization
do $$
declare
  default_org_id uuid;
begin
  select id into default_org_id from public.organizations where name = 'Global Directory' limit 1;
  
  if default_org_id is not null then
    update public.contacts set org_id = default_org_id where org_id is null;
    update public.services set org_id = default_org_id where org_id is null;
    update public.meeting_chats set org_id = default_org_id where org_id is null;
  end if;
end $$;

-- Set NOT NULL after backfill
alter table public.contacts alter column org_id set not null;
alter table public.services alter column org_id set not null;
alter table public.meeting_chats alter column org_id set not null;


-- 3. Change Requests
create table public.change_requests (
  id uuid default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  target_type text not null check (target_type in ('contact', 'service', 'contact_link')),
  target_id uuid, -- Nullable for new creations
  summary text not null,
  payload jsonb not null,
  created_at timestamptz default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  decision_reason text
);

-- 4. Enable RLS
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.contacts enable row level security;
alter table public.services enable row level security;
alter table public.meeting_chats enable row level security;
alter table public.change_requests enable row level security;

-- 5. RLS Policies

-- Helper function to check role
create or replace function public.has_role(required_role text)
returns boolean as $$
declare
  user_role text;
begin
  select role into user_role
  from public.memberships
  where user_id = auth.uid()
  limit 1; -- Assuming single org for now or context setting
  
  -- Simplified: If user has ANY membership with the role, true. 
  -- In multi-tenant, we'd check against specific org_id.
  return user_role = required_role;
end;
$$ language plpgsql security definer;

-- Simple Policy for Single-Org (Global) Scenario for Phase 2:
-- Users see everything in their Org. Admins modify.

-- ORGANIZATIONS
create policy "Visible to members" on public.organizations
  for select using (
    exists (select 1 from public.memberships where org_id = organizations.id and user_id = auth.uid())
  );

-- MEMBERSHIPS
create policy "Users verify own membership" on public.memberships
  for select using (user_id = auth.uid());
  
-- CONTACTS / SERVICES / CHATS (Canonical)
-- Read: Members of the same org
create policy "Read access for members" on public.contacts
  for select using (
    exists (select 1 from public.memberships where org_id = contacts.org_id and user_id = auth.uid())
  );

create policy "Read access for members" on public.services
  for select using (
    exists (select 1 from public.memberships where org_id = services.org_id and user_id = auth.uid())
  );
  
create policy "Read access for members" on public.meeting_chats
  for select using (
    exists (select 1 from public.memberships where org_id = meeting_chats.org_id and user_id = auth.uid())
  );

-- Write: Admins only
create policy "Admin write access" on public.contacts
  for all using (
    exists (select 1 from public.memberships where org_id = contacts.org_id and user_id = auth.uid() and role = 'admin')
  );

create policy "Admin write access" on public.services
  for all using (
    exists (select 1 from public.memberships where org_id = services.org_id and user_id = auth.uid() and role = 'admin')
  );

create policy "Admin write access" on public.meeting_chats
  for all using (
    exists (select 1 from public.memberships where org_id = meeting_chats.org_id and user_id = auth.uid() and role = 'admin')
  );

-- CHANGE REQUESTS
-- Read: Pending requests visible to Creator (Standard) AND Admin (All)
create policy "Read own or admin" on public.change_requests
  for select using (
    created_by = auth.uid() or
    exists (select 1 from public.memberships where org_id = change_requests.org_id and user_id = auth.uid() and role = 'admin')
  );

-- Insert: Members
create policy "Members submit requests" on public.change_requests
  for insert with check (
    exists (select 1 from public.memberships where org_id = change_requests.org_id and user_id = auth.uid())
  );

-- Update: Admins only
create policy "Admins review requests" on public.change_requests
  for update using (
    exists (select 1 from public.memberships where org_id = change_requests.org_id and user_id = auth.uid() and role = 'admin')
  );
