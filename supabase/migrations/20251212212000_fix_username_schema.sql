-- Fix: Restore username column and update user data
-- This is required because the frontend relies on the username column

-- 1. Restore username column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;
-- 2. Populate username for existing users (fallback to part of email if needed, though mostly empty now)
-- We join with auth.users to get the email if username is failing, but for now just default to 'admin' for the known user or empty.

-- 3. Update handle_new_user trigger to include username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, username, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'admin'::app_role),
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    username = EXCLUDED.username,
    role = EXCLUDED.role;
  RETURN NEW;
END;
$$;
-- 4. Fix the specific admin user data (admin@desk.com)
-- Update auth metadata
UPDATE auth.users
SET raw_user_meta_data = '{"username": "admin", "full_name": "Administrator", "role": "admin"}'::jsonb
WHERE email = 'admin@desk.com';
-- Sync to public.users
INSERT INTO public.users (id, full_name, username, role, is_active)
SELECT 
  id,
  'Administrator',
  'admin',
  'admin'::app_role,
  true
FROM auth.users
WHERE email = 'admin@desk.com'
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  role = EXCLUDED.role;
