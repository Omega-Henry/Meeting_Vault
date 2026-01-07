-- 008_rich_profiles.sql
-- MeetingVault Major Upgrade: Rich Profile Data Model
-- Date: 2026-01-07

-- ============================================
-- 1. Extend contact_profiles with rich fields
-- ============================================
-- Note: Some columns may already exist from migration 006, using IF NOT EXISTS

ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS cell_phone text;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS office_phone text;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS blinq text;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS communities text[] DEFAULT '{}';
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS markets text[] DEFAULT '{}';
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS min_target_price numeric;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS max_target_price numeric;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS limits jsonb DEFAULT '{}';
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS i_can_help_with text;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS help_me_with text;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS hot_plate text;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS message_to_world text;
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS role_tags text[] DEFAULT '{}';
ALTER TABLE public.contact_profiles ADD COLUMN IF NOT EXISTS completeness_score int DEFAULT 0;

-- ============================================
-- 2. Link services to contact_id
-- ============================================
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_services_contact_id ON public.services(contact_id);

-- ============================================
-- 3. Role Tags Reference Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.role_tag_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name text UNIQUE NOT NULL,
  full_name text NOT NULL,
  emoji text,
  aliases text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- RLS for role_tag_definitions (read-only for all authenticated)
ALTER TABLE public.role_tag_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read role tags" ON public.role_tag_definitions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Seed initial role tags based on user's acronym list
INSERT INTO public.role_tag_definitions (tag_name, full_name, emoji, aliases) VALUES
  ('tc', 'Transaction Coordinator', NULL, ARRAY['ttc', 'tttc', 'transaction coordinator', 'top tier transaction coordinator']),
  ('gator', 'Gator Lender', '🐊', ARRAY['gator lender']),
  ('subto', 'Subject-To Specialist', '✌🏼', ARRAY['subject to', 'sub2', 'sub-to']),
  ('oc', 'Owners Club', NULL, ARRAY['owners club']),
  ('bird_dog', 'Bird Dog', '🐕', ARRAY['birddog', 'bird-dog']),
  ('dts', 'Direct To Seller', NULL, ARRAY['direct to seller']),
  ('dta', 'Direct To Agent', NULL, ARRAY['direct to agent']),
  ('zdb', 'Zero Down Business', NULL, ARRAY['zd', 'zero down'])
ON CONFLICT (tag_name) DO NOTHING;

-- ============================================
-- 4. AI Usage Tracking (for cost control)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  query text NOT NULL,
  tokens_used int,
  model_used text,
  response_time_ms int,
  created_at timestamptz DEFAULT now()
);

-- Indexes for usage analytics
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON public.ai_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON public.ai_usage(created_at DESC);

-- RLS for ai_usage
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own usage" ON public.ai_usage 
  FOR SELECT USING (auth.uid() = user_id);

-- Insert is done via service role, so no INSERT policy needed for users

-- ============================================
-- 5. Note: services.contact_id already exists in base schema
-- ============================================
-- The services table already links to contacts via contact_id (see schema.sql)
-- No data migration needed here.

-- ============================================
-- 6. Add service source tracking
-- ============================================
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS source text DEFAULT 'ai_extracted';
-- source values: 'ai_extracted', 'user_added', 'admin_added'

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS source_meeting_id uuid REFERENCES public.meeting_chats(id) ON DELETE SET NULL;

-- ============================================
-- 7. Completeness score trigger function
-- ============================================
CREATE OR REPLACE FUNCTION calculate_profile_completeness()
RETURNS TRIGGER AS $$
DECLARE
  score int := 0;
  total_fields int := 12;
BEGIN
  -- Count filled fields
  IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN score := score + 1; END IF;
  IF NEW.avatar_url IS NOT NULL THEN score := score + 1; END IF;
  IF NEW.cell_phone IS NOT NULL THEN score := score + 1; END IF;
  IF NEW.blinq IS NOT NULL THEN score := score + 1; END IF;
  IF NEW.website IS NOT NULL THEN score := score + 1; END IF;
  IF array_length(NEW.assets, 1) > 0 THEN score := score + 1; END IF;
  IF array_length(NEW.markets, 1) > 0 THEN score := score + 1; END IF;
  IF NEW.buy_box IS NOT NULL AND NEW.buy_box != '{}' THEN score := score + 1; END IF;
  IF NEW.i_can_help_with IS NOT NULL THEN score := score + 1; END IF;
  IF NEW.help_me_with IS NOT NULL THEN score := score + 1; END IF;
  IF NEW.hot_plate IS NOT NULL THEN score := score + 1; END IF;
  IF NEW.message_to_world IS NOT NULL THEN score := score + 1; END IF;
  
  -- Calculate percentage
  NEW.completeness_score := (score * 100) / total_fields;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_profile_completeness ON public.contact_profiles;
CREATE TRIGGER update_profile_completeness
  BEFORE INSERT OR UPDATE ON public.contact_profiles
  FOR EACH ROW
  EXECUTE FUNCTION calculate_profile_completeness();

-- ============================================
-- 8. Grant permissions for service role
-- ============================================
-- Ensure service role can insert AI usage records
GRANT INSERT ON public.ai_usage TO service_role;
GRANT SELECT ON public.role_tag_definitions TO authenticated;
