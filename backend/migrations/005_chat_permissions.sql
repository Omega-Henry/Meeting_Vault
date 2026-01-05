-- Enable RLS on meeting_chats
ALTER TABLE public.meeting_chats ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view chats in their organization
DROP POLICY IF EXISTS "Members can view chats" ON public.meeting_chats;
CREATE POLICY "Members can view chats"
ON public.meeting_chats FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM public.memberships 
    WHERE org_id = meeting_chats.org_id
  )
);

-- Policy: Admins can do everything with chats
DROP POLICY IF EXISTS "Admins can manage chats" ON public.meeting_chats;
CREATE POLICY "Admins can manage chats"
ON public.meeting_chats FOR ALL
USING (
  auth.uid() IN (
    SELECT user_id FROM public.memberships 
    WHERE org_id = meeting_chats.org_id AND role = 'admin'
  )
);

-- Ensure Services table is also secured (it might have some policies, let's reinforce implicit admin write)
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view services
DROP POLICY IF EXISTS "Members can view services" ON public.services;
CREATE POLICY "Members can view services"
ON public.services FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM public.memberships 
    WHERE org_id = services.org_id
  )
);

-- Policy: Admins can manage services
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;
CREATE POLICY "Admins can manage services"
ON public.services FOR ALL
USING (
  auth.uid() IN (
    SELECT user_id FROM public.memberships 
    WHERE org_id = services.org_id AND role = 'admin'
  )
);
