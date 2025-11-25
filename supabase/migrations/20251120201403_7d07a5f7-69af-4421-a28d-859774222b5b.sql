-- Fix RLS policies for users table to allow super_admin to insert users
DROP POLICY IF EXISTS "Super admins can manage users" ON public.users;

-- Create separate policies for different operations
CREATE POLICY "Super admins can insert users"
ON public.users
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    INNER JOIN user_sessions us ON us.user_id = u.id
    WHERE us.session_token = current_setting('request.headers', true)::json->>'x-session-token'
      AND us.expires_at > now()
      AND u.role = 'super_admin'
      AND u.is_active = true
  )
);

CREATE POLICY "Super admins can update users"
ON public.users
FOR UPDATE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    INNER JOIN user_sessions us ON us.user_id = u.id
    WHERE us.session_token = current_setting('request.headers', true)::json->>'x-session-token'
      AND us.expires_at > now()
      AND u.role = 'super_admin'
      AND u.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    INNER JOIN user_sessions us ON us.user_id = u.id
    WHERE us.session_token = current_setting('request.headers', true)::json->>'x-session-token'
      AND us.expires_at > now()
      AND u.role = 'super_admin'
      AND u.is_active = true
  )
);

CREATE POLICY "Super admins can delete users"
ON public.users
FOR DELETE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    INNER JOIN user_sessions us ON us.user_id = u.id
    WHERE us.session_token = current_setting('request.headers', true)::json->>'x-session-token'
      AND us.expires_at > now()
      AND u.role = 'super_admin'
      AND u.is_active = true
  )
);