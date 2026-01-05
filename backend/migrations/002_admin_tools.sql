-- 1. Soft Delete for Contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- 2. Contact Links Table (for rigorous link management)
-- This separates links from the array column in contacts for better normalization if needed, 
-- but consistent with text array, we might just keep using the array. 
-- However, the prompt specifically asked for "Manage contact_links (add/remove normalized links carefully)" 
-- and mentioned re-linking contact_links.
-- Let's create a table to be safe and robust.
CREATE TABLE IF NOT EXISTS public.contact_links (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    link text NOT NULL,
    normalized_link text,
    created_at timestamptz DEFAULT now()
);

-- RLS for contact_links
ALTER TABLE public.contact_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read access for members" ON public.contact_links
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.memberships WHERE org_id = contact_links.org_id AND user_id = auth.uid())
    );

CREATE POLICY "Admin write access" ON public.contact_links
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.memberships WHERE org_id = contact_links.org_id AND user_id = auth.uid() AND role = 'admin')
    );

-- 3. Merge Audit Log
CREATE TABLE IF NOT EXISTS public.merge_audit_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    primary_contact_id uuid NOT NULL, -- Keep ID even if contact deleted later? preferably ref
    merged_contact_ids uuid[] NOT NULL,
    timestamp timestamptz DEFAULT now(),
    details jsonb -- Store what fields were updated or snapshot
);

-- RLS for audit log (Admins only)
ALTER TABLE public.merge_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs" ON public.merge_audit_log
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.memberships WHERE org_id = merge_audit_log.org_id AND user_id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Admins can insert audit logs" ON public.merge_audit_log
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships WHERE org_id = merge_audit_log.org_id AND user_id = auth.uid() AND role = 'admin')
    );
