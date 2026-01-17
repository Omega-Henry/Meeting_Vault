-- Enable UUID extension
create extension if not exists "pgcrypto";

-- 1. meeting_chats
create table public.meeting_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  telegram_chat_id text not null,
  meeting_name text not null,
  chat_hash text not null,
  cleaned_text text not null,
  cleaned_transcript jsonb null, -- Structured transcript (Sender, Message)
  digest_bullets jsonb null,
  created_at timestamptz not null default now()
);

-- Indexes for meeting_chats
create unique index idx_meeting_chats_user_hash on public.meeting_chats (user_id, chat_hash);
create index idx_meeting_chats_user_created on public.meeting_chats (user_id, created_at desc);

-- RLS for meeting_chats
alter table public.meeting_chats enable row level security;

create policy "Users can only access their own meeting chats"
on public.meeting_chats for all
using (auth.uid() = user_id);

-- 2. contacts
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text null,
  email text null,
  phone text null,
  links jsonb null, -- raw links array
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for contacts
create unique index idx_contacts_user_email on public.contacts (user_id, email) where email is not null;
create unique index idx_contacts_user_phone on public.contacts (user_id, phone) where phone is not null;
create index idx_contacts_user_name on public.contacts (user_id, name);

-- RLS for contacts
alter table public.contacts enable row level security;

create policy "Users can only access their own contacts"
on public.contacts for all
using (auth.uid() = user_id);

-- 3. contact_links
create table public.contact_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  link text not null,
  normalized_link text not null,
  created_at timestamptz not null default now()
);

-- Indexes for contact_links
create unique index idx_contact_links_user_norm on public.contact_links (user_id, normalized_link);
create index idx_contact_links_contact_id on public.contact_links (contact_id);

-- RLS for contact_links
alter table public.contact_links enable row level security;

create policy "Users can only access their own contact links"
on public.contact_links for all
using (auth.uid() = user_id);

-- 4. services
create table public.services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  meeting_chat_id uuid null references public.meeting_chats(id) on delete cascade,
  type text not null check (type in ('offer', 'request')),
  description text not null,
  links jsonb null,
  created_at timestamptz not null default now()
);

-- Indexes for services
create index idx_services_user_type on public.services (user_id, type);
create index idx_services_contact_id on public.services (contact_id);
create index idx_services_meeting_id on public.services (meeting_chat_id);

-- RLS for services
alter table public.services enable row level security;

create policy "Users can only access their own services"
on public.services for all
using (auth.uid() = user_id);

-- 5. contact_profiles
create table public.contact_profiles (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  
  -- Core Contact Fields (Extensions)
  blinq text null,
  website text null,
  cell_phone text null,
  office_phone text null,
  
  -- Rich Profile Fields
  bio text null,
  avatar_url text null,
  social_media jsonb null default '{}'::jsonb, -- {platform: url}
  communities text[] null default '{}',
  role_tags text[] null default '{}',
  
  -- Business Logic
  hot_plate text null, -- "What I'm currently working on"
  i_can_help_with text null,
  help_me_with text null,
  message_to_world text null,
  
  -- Structured Data (Indexing)
  asset_classes text[] null default '{}',
  markets text[] null default '{}', -- States or Regions
  min_target_price numeric null,
  max_target_price numeric null,
  
  -- The Buy Box (Searchable)
  -- Structure: { assets: [], markets: [], min_price: number, max_price: number, strategy: [], limits: {} }
  buy_box jsonb null default '{}'::jsonb,
  
  -- Provenance tracking for AI/User edits
  -- Structure: { "field_name": "ai_generated" | "user_verified" }
  field_provenance jsonb null default '{}'::jsonb,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint: One profile per contact
create unique index idx_contact_profiles_contact_id on public.contact_profiles (contact_id);

-- GIN Index for fast Buy Box searching
create index idx_contact_profiles_buy_box on public.contact_profiles using gin (buy_box);

-- RLS for contact_profiles
alter table public.contact_profiles enable row level security;

-- Add user_id for RLS ownership
alter table public.contact_profiles add column user_id uuid not null references auth.users(id);

create policy "Users can only access their own contact profiles"
on public.contact_profiles for all
using (auth.uid() = user_id);

create index idx_contact_profiles_user_id on public.contact_profiles (user_id);
