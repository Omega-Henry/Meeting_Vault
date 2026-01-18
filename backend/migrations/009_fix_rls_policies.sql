-- Migration 009: Fix RLS Policies (Simplified for Current Schema)
-- Updates RLS policies to match the permission model:
-- - Members can READ all data from users in their org (via memberships table)
-- - Members can UPDATE only their claimed and approved contacts
-- - Admins can UPDATE everything

-- NOTE: Your current schema uses user_id, NOT org_id
-- This migration works with the existing schema structure

-- Add claim_status field to contacts if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contacts' AND column_name = 'claim_status'
    ) THEN
        ALTER TABLE contacts ADD COLUMN claim_status TEXT CHECK (claim_status IN ('pending', 'approved', 'rejected'));
        RAISE NOTICE 'Added claim_status column to contacts';
    ELSE
        RAISE NOTICE 'claim_status column already exists';
    END IF;
    
    -- Add claimed_by_user_id if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contacts' AND column_name = 'claimed_by_user_id'
    ) THEN
        ALTER TABLE contacts ADD COLUMN claimed_by_user_id UUID REFERENCES auth.users(id);
        RAISE NOTICE 'Added claimed_by_user_id column to contacts';
    ELSE
        RAISE NOTICE 'claimed_by_user_id column already exists';
    END IF;
    
    -- Add org_id if missing (for future multi-org support)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contacts' AND column_name = 'org_id'  
    ) THEN
        -- For now, org_id is optional. When multi-org is implemented, backfill from memberships.
        ALTER TABLE contacts ADD COLUMN org_id UUID REFERENCES organizations(id);
        RAISE NOTICE 'Added org_id column to contacts (nullable for backward compatibility)';
    ELSE
        RAISE NOTICE 'org_id column already exists';
    END IF;
END $$;

-- Drop old restrictive policies on contacts (if they exist)
DROP POLICY IF EXISTS "Users can only access their own contacts" ON contacts;
DROP POLICY IF EXISTS "Users can access contacts" ON contacts;

-- New READ policy: Users can read their own contacts + contacts from org members
CREATE POLICY "Users can read their own and org contacts"
ON contacts FOR SELECT
USING (
    -- User owns this contact
    auth.uid() = user_id
    OR
    -- Contact belongs to someone in user's org (via memberships)
    user_id IN (
        SELECT m2.user_id FROM memberships m1
        JOIN memberships m2 ON m1.org_id = m2.org_id
        WHERE m1.user_id = auth.uid()
    )
);

-- New UPDATE policy: Admin or claimed profile owner
CREATE POLICY "Admin or claimed owner can update contacts"
ON contacts FOR UPDATE  
USING (
    -- Admin can update anything
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
    OR
    -- User owns this contact record
    auth.uid() = user_id
    OR
    -- Member claimed this contact and it was approved
    (claimed_by_user_id = auth.uid() AND claim_status = 'approved')
);

-- INSERT policy: Admins and regular users can create contacts
CREATE POLICY "Users can create contacts"
ON contacts FOR INSERT
WITH CHECK (
    -- User creating their own contact
    auth.uid() = user_id
    OR
    -- Admin can create for anyone
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
);

-- DELETE policy: Only admins or owners
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

-- Apply similar pattern to services table
DROP POLICY IF EXISTS "Users can only access their own services" ON services;

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

-- Apply similar pattern to meeting_chats
DROP POLICY IF EXISTS "Users can only access their own meeting chats" ON meeting_chats;

CREATE POLICY "Users can read their own and org meeting chats"
ON meeting_chats FOR SELECT
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
ON meeting_chats FOR ALL
USING (
    auth.uid() = user_id
    OR
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
    )
);

-- Contact profiles: Check if table exists first
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contact_profiles') THEN
        -- Add user_id column if missing (needed for RLS policies)
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'contact_profiles' AND column_name = 'user_id'
        ) THEN
            -- Add user_id, populate from contacts table
            ALTER TABLE contact_profiles ADD COLUMN user_id UUID REFERENCES auth.users(id);
            
            -- Backfill user_id from contacts table
            UPDATE contact_profiles 
            SET user_id = contacts.user_id 
            FROM contacts 
            WHERE contact_profiles.contact_id = contacts.id;
            
            -- Now make it NOT NULL (after backfill)
            ALTER TABLE contact_profiles ALTER COLUMN user_id SET NOT NULL;
            
            RAISE NOTICE 'Added and backfilled user_id column to contact_profiles';
        ELSE
            RAISE NOTICE 'user_id column already exists in contact_profiles';
        END IF;
        
        -- Drop old policy
        EXECUTE 'DROP POLICY IF EXISTS "Users can only access their own contact profiles" ON contact_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "Users can read their own and org contact profiles" ON contact_profiles';
        EXECUTE 'DROP POLICY IF EXISTS "Admin or profile owner can update profiles" ON contact_profiles';
        
        -- New read policy
        EXECUTE 'CREATE POLICY "Users can read their own and org contact profiles"
        ON contact_profiles FOR SELECT
        USING (
            auth.uid() = user_id
            OR
            user_id IN (
                SELECT m2.user_id FROM memberships m1
                JOIN memberships m2 ON m1.org_id = m2.org_id
                WHERE m1.user_id = auth.uid()
            )
        )';
        
        -- New update policy
        EXECUTE 'CREATE POLICY "Admin or profile owner can update profiles"
        ON contact_profiles FOR UPDATE
        USING (
            EXISTS (
                SELECT 1 FROM memberships 
                WHERE user_id = auth.uid() 
                AND role = ''admin''
            )
            OR
            auth.uid() = user_id
            OR
            contact_id IN (
                SELECT id FROM contacts 
                WHERE claimed_by_user_id = auth.uid() 
                AND claim_status = ''approved''
            )
        )';
        
        -- Insert policy
        EXECUTE 'CREATE POLICY "Admins and owners can insert profiles"
        ON contact_profiles FOR INSERT
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM memberships 
                WHERE user_id = auth.uid() 
                AND role = ''admin''
            )
            OR
            auth.uid() = user_id
        )';
        
        RAISE NOTICE 'Updated contact_profiles RLS policies';
    ELSE
        RAISE NOTICE 'contact_profiles table does not exist, skipping';
    END IF;
END $$;

COMMENT ON POLICY "Users can read their own and org contacts" ON contacts IS 'All org members have read access via memberships table';
COMMENT ON POLICY "Admin or claimed owner can update contacts" ON contacts IS 'Only admins, owners, or approved profile claimants can modify';
