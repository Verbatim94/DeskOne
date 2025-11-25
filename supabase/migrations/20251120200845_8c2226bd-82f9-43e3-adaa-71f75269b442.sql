-- Add policy to allow login authentication
-- This allows reading user credentials during login process
CREATE POLICY "Allow login authentication"
ON public.users
FOR SELECT
TO anon, authenticated
USING (true);

-- Create default admin user if not exists
INSERT INTO public.users (username, password, full_name, role, is_active)
VALUES ('admin', 'admin123', 'System Administrator', 'super_admin', true)
ON CONFLICT (username) DO NOTHING;