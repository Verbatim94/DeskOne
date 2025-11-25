-- Fix search_path for security definer functions
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_token TEXT;
  user_id_result UUID;
BEGIN
  session_token := current_setting('request.headers', true)::json->>'x-session-token';
  
  IF session_token IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT user_id INTO user_id_result
  FROM user_sessions
  WHERE session_token = get_current_user_id.session_token
    AND expires_at > now();
  
  RETURN user_id_result;
END;
$$;

CREATE OR REPLACE FUNCTION has_role(check_role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
BEGIN
  SELECT role INTO user_role
  FROM users
  WHERE id = get_current_user_id()
    AND is_active = true;
  
  RETURN user_role = check_role OR user_role = 'super_admin';
END;
$$;

CREATE OR REPLACE FUNCTION has_room_access(check_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  user_role app_role;
BEGIN
  current_user_id := get_current_user_id();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT role INTO user_role
  FROM users
  WHERE id = current_user_id AND is_active = true;
  
  IF user_role = 'super_admin' THEN
    RETURN true;
  END IF;
  
  RETURN EXISTS (
    SELECT 1
    FROM room_access
    WHERE room_id = check_room_id
      AND user_id = current_user_id
  );
END;
$$;