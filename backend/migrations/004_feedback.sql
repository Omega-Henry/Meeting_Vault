
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  message text not null,
  rating int check (rating >= 1 and rating <= 5),
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

create policy "Users can insert their own feedback"
on public.feedback for insert
with check (auth.uid() = user_id);

-- Admins (via service role or admin policy) need to view.
-- Assuming backend admin uses service role, so explicit policy might not be needed for admin *api*, 
-- but if we use frontend Supabase client for admins, we need a policy.
-- create policy "Admins can view all feedback" ... 
