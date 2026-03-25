-- Restore public.users from auth.users
-- This is necessary after a db reset that wipes public schema but preserves auth
insert into public.users (id, username, full_name, role, is_active)
select 
  id, 
  coalesce(raw_user_meta_data->>'username', email), 
  coalesce(raw_user_meta_data->>'full_name', email), 
  coalesce(raw_user_meta_data->>'role', 'admin')::app_role, -- Cast to app_role enum
  true
from auth.users
on conflict (id) do nothing;
