-- Fix search_path security issues in database functions
-- This resolves the Security Advisor warnings

-- Recreate handle_new_user with proper search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
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
$$;
-- Recreate get_current_user_id with proper search_path
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.uid();
$$;
-- Recreate has_role with proper search_path
CREATE OR REPLACE FUNCTION public.has_role(check_role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
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
-- Recreate has_room_access with proper search_path
CREATE OR REPLACE FUNCTION public.has_room_access(check_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
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
    FROM public.room_access
    WHERE room_id = check_room_id
      AND user_id = current_user_id
  );
END;
$$;
