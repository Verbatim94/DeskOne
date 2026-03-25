-- Create table for fixed assignment exceptions (cancelled days)
create table if not exists public.fixed_assignment_exceptions (
  id uuid default gen_random_uuid() primary key,
  fixed_assignment_id uuid references public.fixed_assignments(id) on delete cascade not null,
  date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) not null,
  
  -- Prevent duplicate exceptions for the same assignment and date
  unique(fixed_assignment_id, date)
);
-- Enable RLS
alter table public.fixed_assignment_exceptions enable row level security;
-- Policies for fixed_assignment_exceptions

-- Users can view exceptions for assignments they can view (room admins or assigned user)
-- Ideally we just open read access to authenticated users to simplify, as lists are filtered by API
create policy "Users can view exceptions"
  on public.fixed_assignment_exceptions for select
  using (auth.role() = 'authenticated');
-- Users can insert exceptions if they are the assigned user or a room admin
-- This validation is primarily handled in the Edge Function, but RLS adds a layer
create policy "Users can insert exceptions for their own assignments"
  on public.fixed_assignment_exceptions for insert
  with check (
    auth.uid() = created_by 
    AND 
    exists (
      select 1 from public.fixed_assignments fa
      where fa.id = fixed_assignment_id
      and (fa.assigned_to = auth.uid())
    )
  );
-- Admins policy handled generally or via service role in Edge Functions
-- But adding a general policy for admins/service role
create policy "Service role and admins can manage exceptions"
  on public.fixed_assignment_exceptions for all
  using (
    auth.jwt()->>'role' = 'service_role' 
    OR 
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );
