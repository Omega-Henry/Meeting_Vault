-- Updated Schema - Zoom Digester Database
-- Includes all migrations applied (007, 008, 009)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- 1. meeting_chats
CREATE TABLE public.meeting_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  telegram_chat_id TEXT NOT NULL,
  meeting_name TEXT NOT NULL,
  chat_hash TEXT NOT NULL,
  cleaned_text TEXT NOT NULL,
  cleaned_transcript JSONB NULL,
  digest_bullets JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_meeting_chats_user_hash ON public.meeting_chats (user_id, chat_hash);
CREATE INDEX idx_meeting_chats_user_created ON public.meeting_chats (user_id, created_at DESC);

ALTER TABLE public.meeting_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own and org meeting chats"
ON public.meeting_chats FOR SELECT
USING (
    auth.uid() = user_id
    OR
    user_id IN (
        SELECT m2.user_id FROM memberships m1
        JOIN memberships m2 ON m1.org_id = m2.org_id
        WHERE m1.user_id = auth.uid()
    )
);

CREATE POLICY "Admins and owners can modify meeting chats"
ON public.meeting_chats FOR ALL
USING (
    auth.uid() = user_id
    OR
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
);

-- 2. contacts
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NULL REFERENCES organizations(id),
  name TEXT NULL,
  email TEXT NULL,
  phone TEXT NULL,
  links JSONB NULL,
  claimed_by_user_id UUID NULL REFERENCES auth.users(id),
  claim_status TEXT NULL CHECK (claim_status IN ('pending', 'approved', 'rejected')),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contacts_user_email ON public.contacts (user_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_contacts_user_phone ON public.contacts (user_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_contacts_user_name ON public.contacts (user_id, name);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own and org contacts"
ON contacts FOR SELECT
USING (
    auth.uid() = user_id
    OR
    user_id IN (
        SELECT m2.user_id FROM memberships m1
        JOIN memberships m2 ON m1.org_id = m2.org_id
        WHERE m1.user_id = auth.uid()
    )
);

CREATE POLICY "Admin or claimed owner can update contacts"
ON contacts FOR UPDATE  
USING (
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
    OR
    auth.uid() = user_id
    OR
    (claimed_by_user_id = auth.uid() AND claim_status = 'approved')
);

CREATE POLICY "Users can create contacts"
ON contacts FOR INSERT
WITH CHECK (
    auth.uid() = user_id
    OR
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
);

CREATE POLICY "Admins or owners can delete contacts"
ON contacts FOR DELETE
USING (
    auth.uid() = user_id
    OR
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
);

-- 3. contact_links
CREATE TABLE public.contact_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  link TEXT NOT NULL,
  normalized_link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contact_links_user_norm ON public.contact_links (user_id, normalized_link);
CREATE INDEX idx_contact_links_contact_id ON public.contact_links (contact_id);

ALTER TABLE public.contact_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own contact links"
ON public.contact_links FOR ALL
USING (auth.uid() = user_id);

-- 4. services
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  meeting_chat_id UUID NULL REFERENCES public.meeting_chats(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('offer', 'request')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_contact_id ON public.services (contact_id);
CREATE INDEX idx_services_user_created ON public.services (user_id, created_at DESC);
CREATE INDEX idx_services_meeting_chat_id ON public.services (meeting_chat_id);
CREATE INDEX idx_services_user_id ON public.services (user_id);
CREATE INDEX idx_services_description_fulltext ON public.services USING GIN (to_tsvector('english', description));

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own and org services"
ON services FOR SELECT
USING (
    auth.uid() = user_id
    OR
    user_id IN (
        SELECT m2.user_id FROM memberships m1
        JOIN memberships m2 ON m1.org_id = m2.org_id
        WHERE m1.user_id = auth.uid()
    )
);

CREATE POLICY "Admins and owners can modify services"
ON services FOR ALL
USING (
    auth.uid() = user_id
    OR
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
);

-- 5. contact_profiles
CREATE TABLE public.contact_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Core Contact Fields
  blinq TEXT NULL,
  website TEXT NULL,
  cell_phone TEXT NULL,
  office_phone TEXT NULL,
  
  -- Rich Profile Fields
  bio TEXT NULL,
  avatar_url TEXT NULL,
  social_media JSONB NULL DEFAULT '{}'::jsonb,
  communities TEXT[] NULL DEFAULT '{}',
  role_tags TEXT[] NULL DEFAULT '{}',
  
  -- Business Logic
  hot_plate TEXT NULL,
  i_can_help_with TEXT NULL,
  help_me_with TEXT NULL,
  message_to_world TEXT NULL,
  
  -- Structured Data
  asset_classes TEXT[] NULL DEFAULT '{}',
  markets TEXT[] NULL DEFAULT '{}',
  min_target_price NUMERIC NULL,
  max_target_price NUMERIC NULL,
  
  -- Buy Box
  buy_box JSONB NULL DEFAULT '{}'::jsonb,
  
  -- Provenance tracking
  field_provenance JSONB NULL DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contact_profiles_contact_id ON public.contact_profiles (contact_id);
CREATE INDEX idx_contact_profiles_buy_box ON public.contact_profiles USING GIN (buy_box);
CREATE INDEX idx_contact_profiles_user_id ON public.contact_profiles (user_id);
CREATE INDEX idx_contact_profiles_role_tags_gin ON public.contact_profiles USING GIN (role_tags);
CREATE INDEX idx_contact_profiles_asset_classes_gin ON public.contact_profiles USING GIN (asset_classes);
CREATE INDEX idx_contact_profiles_markets_gin ON public.contact_profiles USING GIN (markets);

ALTER TABLE public.contact_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own and org contact profiles"
ON contact_profiles FOR SELECT
USING (
    auth.uid() = user_id
    OR
    user_id IN (
        SELECT m2.user_id FROM memberships m1
        JOIN memberships m2 ON m1.org_id = m2.org_id
        WHERE m1.user_id = auth.uid()
    )
);

CREATE POLICY "Admin or profile owner can update profiles"
ON contact_profiles FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
    OR
    auth.uid() = user_id
    OR
    contact_id IN (
        SELECT id FROM contacts 
        WHERE claimed_by_user_id = auth.uid() 
        AND claim_status = 'approved'
    )
);

CREATE POLICY "Admins and owners can insert profiles"
ON contact_profiles FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
    OR
    auth.uid() = user_id
);

-- ============================================================================
-- AI CHAT HISTORY (Migration 007)
-- ============================================================================

CREATE TABLE public.ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls JSONB,
    tool_outputs JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_chat_sessions_user_id ON ai_chat_sessions(user_id);
CREATE INDEX idx_ai_chat_sessions_org_id ON ai_chat_sessions(org_id);
CREATE INDEX idx_ai_chat_messages_session_id ON ai_chat_messages(session_id);
CREATE INDEX idx_ai_chat_messages_created_at ON ai_chat_messages(created_at);

ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own chat sessions"
ON ai_chat_sessions FOR ALL
USING (user_id = auth.uid());

CREATE POLICY "Users can only access messages from their sessions"
ON ai_chat_messages FOR ALL
USING (
    session_id IN (
        SELECT id FROM ai_chat_sessions WHERE user_id = auth.uid()
    )
);

-- Trigger to update session timestamp
CREATE OR REPLACE FUNCTION update_ai_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ai_chat_sessions 
    SET updated_at = now() 
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_session_on_message
AFTER INSERT ON ai_chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_ai_session_timestamp();
