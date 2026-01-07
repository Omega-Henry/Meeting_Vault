-- 006_major_update_schema.sql

-- 1. Contact Profiles (Rich Data)
-- Separating rich profile data effectively creates a "Member" vs "Just a Contact" distinction,
-- while allowing all contacts to potentially have extended info.
create table public.contact_profiles (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  bio text,
  avatar_url text, -- Supabase Storage URL
  assets jsonb default '[]', -- e.g. ["SFH", "Multifamily"]
  buy_box jsonb default '{}', -- Strict criteria
  field_provenance jsonb default '{}', -- e.g. {"bio": "user_verified", "phone": "ai_generated"}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.contact_profiles enable row level security;

-- Policies for contact_profiles
-- READ: Visible to all authenticated users (Global Directory)
create policy "Visible to all users" on public.contact_profiles
  for select using (auth.role() = 'authenticated'); -- Simplified for Global Directory, refine if multi-tenant strictness needed

-- UPDATE: Contact owner (if claimed) OR Admin
-- We need to know which USER owns this contact. 
-- For now, `contacts` table should link to a user if claimed? 
-- The plan mentions `claim_requests` but we need to store the "claimed by" state on the contact itself or a mapping.
-- Let's add `claimed_by_user_id` to contacts.

alter table public.contacts add column claimed_by_user_id uuid references auth.users(id);

create policy "Claimed user can update own profile" on public.contact_profiles
  for update using (
    exists (
      select 1 from public.contacts 
      where contacts.id = contact_profiles.contact_id 
      and contacts.claimed_by_user_id = auth.uid()
    )
  );

create policy "Admins can update all profiles" on public.contact_profiles
  for update using (
    exists (
      select 1 from public.memberships 
      where user_id = auth.uid() 
      and role = 'admin'
    ) -- Assuming global admin or admin of the contact's org
  );


-- 2. Contact Aliases (Deduplication helper)
create table public.contact_aliases (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  alias text not null, -- Raw text extracted
  normalized_alias text not null, -- Lowercase, trimmed, standard format
  source_meeting_id uuid references public.meeting_chats(id),
  created_at timestamptz default now()
);

-- Index for fast lookup
create index idx_contact_aliases_normalized on public.contact_aliases(normalized_alias);

-- RLS
alter table public.contact_aliases enable row level security;
create policy "Visible to all users" on public.contact_aliases for select using (auth.role() = 'authenticated');


-- 3. Claim Requests
create table public.claim_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  contact_id uuid not null references public.contacts(id),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  evidence jsonb default '{}', -- e.g. {"match_type": "phone", "value": "+1234567890"}
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  decision_reason text
);

-- RLS
alter table public.claim_requests enable row level security;

-- READ: User sees own, Admin sees all
create policy "User sees own claims" on public.claim_requests
  for select using (auth.uid() = user_id);

create policy "Admin sees all claims" on public.claim_requests
  for select using (
    exists (
        select 1 from public.memberships 
        where user_id = auth.uid() 
        and role = 'admin'
    )
  );

-- INSERT: Authenticated users can create claims
create policy "Users create claims" on public.claim_requests
  for insert with check (auth.uid() = user_id);

-- UPDATE: Admins only (approve/reject)
create policy "Admins update claims" on public.claim_requests
  for update using (
    exists (
        select 1 from public.memberships 
        where user_id = auth.uid() 
        and role = 'admin'
    )
  );


-- 4. Audit Log
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null, -- 'update_profile', 'merge_contacts', 'approve_claim'
  target_type text not null, -- 'contact', 'service'
  target_id uuid,
  diff jsonb, -- { "before": ..., "after": ... }
  created_at timestamptz default now()
);

-- RLS: Admins read only
alter table public.audit_log enable row level security;
create policy "Admins read audit logs" on public.audit_log
  for select using (
    exists (
        select 1 from public.memberships 
        where user_id = auth.uid() 
        and role = 'admin'
    )
  );


-- 5. Updates to Existing Tables

-- Services: Add soft delete and user provenance
alter table public.services add column is_archived boolean default false;
alter table public.services add column archive_reason text;
alter table public.services add column created_by_user_id uuid references auth.users(id); -- If manually added

-- Contacts: Add is_unverified (for user submissions)
alter table public.contacts add column is_unverified boolean default false;

