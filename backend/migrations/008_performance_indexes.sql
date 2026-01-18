-- Migration 008: Performance Indexes
-- Adds missing database indexes for better query performance
-- Now with conditional checks for column existence

-- Services table index (frequently joined on meeting_chat_id)
CREATE INDEX IF NOT EXISTS idx_services_meeting_chat_id ON services(meeting_chat_id);

-- Contact profiles array fields (only create if columns exist)
-- Check each field individually since schema may vary

DO $$
BEGIN
    -- role_tags GIN index
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contact_profiles' AND column_name = 'role_tags'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_contact_profiles_role_tags_gin 
        ON contact_profiles USING GIN (role_tags);
    END IF;

    -- asset_classes GIN index
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contact_profiles' AND column_name = 'asset_classes'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_contact_profiles_asset_classes_gin 
        ON contact_profiles USING GIN (asset_classes);
    END IF;

    -- markets GIN index
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contact_profiles' AND column_name = 'markets'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_contact_profiles_markets_gin 
        ON contact_profiles USING GIN (markets);
    END IF;
END $$;

-- Full-text search on service descriptions
CREATE INDEX IF NOT EXISTS idx_services_description_fulltext 
ON services USING GIN (to_tsvector('english', description));

-- Contact links for faster lookups
CREATE INDEX IF NOT EXISTS idx_contact_links_contact_id ON contact_links(contact_id);

-- Services user_id for RLS performance (only if column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'services' AND column_name = 'user_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
    END IF;
END $$;

-- Contact profiles user_id for RLS performance (likely already exists from schema.sql)
-- But check anyway
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contact_profiles' AND column_name = 'user_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_contact_profiles_user_id_perf ON contact_profiles(user_id);
    END IF;
END $$;

COMMENT ON INDEX idx_services_meeting_chat_id IS 'Speeds up JOIN queries between services and meeting_chats';
COMMENT ON INDEX idx_services_description_fulltext IS 'Enables full-text search on service descriptions for AI queries';
