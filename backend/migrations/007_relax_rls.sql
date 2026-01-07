-- 007_relax_rls.sql

-- Relax RLS policies to allow ALL authenticated users to view Global Directory contacts and services.
-- This ensures that users see the directory immediately upon signup, regardless of specific membership complexity.

-- CONTACTS
drop policy "Read access for members" on public.contacts;

create policy "Visible to all authenticated" on public.contacts
  for select using (auth.role() = 'authenticated');

-- SERVICES
drop policy "Read access for members" on public.services;

create policy "Visible to all authenticated" on public.services
  for select using (auth.role() = 'authenticated');

-- MEETING CHATS (Optional, but good for consistency if chats are public)
drop policy "Read access for members" on public.meeting_chats;

create policy "Visible to all authenticated" on public.meeting_chats
  for select using (auth.role() = 'authenticated');
