-- Create default admin user if not exists
INSERT INTO public.users (username, password, full_name, role, is_active)
VALUES ('admin', 'admin', 'System Admin', 'admin', true)
ON CONFLICT (username) DO NOTHING;
