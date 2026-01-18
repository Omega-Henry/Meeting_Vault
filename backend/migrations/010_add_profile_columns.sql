-- Migration 010: Add Missing Profile Columns
-- Adds columns to contact_profiles that may be missing in older databases

-- Rich profile fields
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS asset_classes TEXT[] DEFAULT '{}';
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS markets TEXT[] DEFAULT '{}';
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS role_tags TEXT[] DEFAULT '{}';
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS communities TEXT[] DEFAULT '{}';

-- Price range fields
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS min_target_price NUMERIC;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS max_target_price NUMERIC;

-- Text profile fields
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS hot_plate TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS i_can_help_with TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS help_me_with TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS message_to_world TEXT;

-- Contact extensions
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS blinq TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS cell_phone TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS office_phone TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS social_media JSONB DEFAULT '{}'::jsonb;

-- Buy box and provenance
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS buy_box JSONB DEFAULT '{}'::jsonb;
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS field_provenance JSONB DEFAULT '{}'::jsonb;

-- Add GIN indexes for array fields (if not exists)
CREATE INDEX IF NOT EXISTS idx_contact_profiles_role_tags_gin ON contact_profiles USING GIN (role_tags);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_asset_classes_gin ON contact_profiles USING GIN (asset_classes);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_markets_gin ON contact_profiles USING GIN (markets);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_buy_box ON contact_profiles USING GIN (buy_box);
