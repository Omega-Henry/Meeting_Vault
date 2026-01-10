
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  message text not null,
  rating int check (rating >= 1 and rating <= 5),
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Users can insert their own feedback
create policy "Users can insert their own feedback"
on public.feedback for insert
with check (auth.uid() = user_id);

-- Users can view their own feedback
create policy "Users can view their own feedback"
on public.feedback for select
using (auth.uid() = user_id);

-- Admins can view all feedback (check org_members for admin role)
create policy "Admins can view all feedback"
on public.feedback for select
using (
  exists (
    select 1 from public.org_members
    where org_members.user_id = auth.uid()
    and org_members.role = 'admin'
  )
);

-- Admins can update feedback status
create policy "Admins can update feedback"
on public.feedback for update
using (
  exists (
    select 1 from public.org_members
    where org_members.user_id = auth.uid()
    and org_members.role = 'admin'
  )
);
