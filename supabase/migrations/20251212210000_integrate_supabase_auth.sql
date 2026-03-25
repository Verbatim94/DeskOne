-- Migration to integrate Supabase Auth with existing schema
-- This replaces the custom auth system with Supabase Auth

-- Drop old custom auth components
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP FUNCTION IF EXISTS get_current_user_id() CASCADE;
DROP FUNCTION IF EXISTS has_role(app_role) CASCADE;
DROP FUNCTION IF EXISTS has_room_access(UUID) CASCADE;
-- Alter users table to use auth.users as primary key
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS password;
ALTER TABLE users DROP COLUMN IF EXISTS username;
-- Delete any users that don't exist in auth.users (orphaned records)
DELETE FROM users WHERE id NOT IN (SELECT id FROM auth.users);
-- Now we can safely add the foreign key
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE users ADD PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_id_fkey 
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- Populate users table from existing auth.users
INSERT INTO public.users (id, full_name, role, is_active)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'full_name', email),
  COALESCE((raw_user_meta_data->>'role')::app_role, 'admin'::app_role),
  true
FROM auth.users
ON CONFLICT (id) DO NOTHING;
-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, full_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'admin'::app_role),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Create trigger for new user signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- Recreate helper functions using Supabase Auth
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid();
$$;
CREATE OR REPLACE FUNCTION has_role(check_role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  user_role app_role;
BEGIN
  SELECT role INTO user_role
  FROM public.users
  WHERE id = auth.uid()
    AND is_active = true;
  
  RETURN user_role = check_role OR user_role = 'super_admin';
END;
$$;
CREATE OR REPLACE FUNCTION has_room_access(check_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
  user_role app_role;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get user's global role
  SELECT role INTO user_role
  FROM public.users
  WHERE id = current_user_id AND is_active = true;
  
  -- Super admins and regular admins have access to all rooms
  IF user_role = 'super_admin' OR user_role = 'admin' THEN
    RETURN true;
  END IF;
  
  -- Check if user has room access
  RETURN EXISTS (
    SELECT 1
    FROM room_access
    WHERE room_id = check_room_id
      AND user_id = current_user_id
  );
END;
$$;
