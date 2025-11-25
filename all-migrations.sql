-- Create enum for user roles
CREATE TYPE app_role AS ENUM ('super_admin', 'admin', 'user');

-- Create enum for desk types
CREATE TYPE desk_type AS ENUM ('empty', 'desk', 'premium_desk', 'office', 'entrance', 'wall');

-- Create enum for reservation types
CREATE TYPE reservation_type AS ENUM ('half_day', 'day', 'week', 'month', 'quarter', 'semester', 'meeting');

-- Create enum for reservation status
CREATE TYPE reservation_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- Create enum for time segments
CREATE TYPE time_segment AS ENUM ('AM', 'PM', 'FULL');

-- Create enum for override types
CREATE TYPE override_type AS ENUM ('released', 'assigned');

-- Create enum for room access roles
CREATE TYPE room_role AS ENUM ('admin', 'member');

-- Users table (custom auth, not Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  grid_width INTEGER NOT NULL CHECK (grid_width > 0 AND grid_width <= 50),
  grid_height INTEGER NOT NULL CHECK (grid_height > 0 AND grid_height <= 50),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Room access table (who can see/manage rooms)
CREATE TABLE room_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role room_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Room cells (grid positions in a room)
CREATE TABLE room_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  type desk_type NOT NULL DEFAULT 'empty',
  label TEXT,
  default_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, x, y)
);

-- Reservations table
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cell_id UUID NOT NULL REFERENCES room_cells(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type reservation_type NOT NULL,
  status reservation_status NOT NULL DEFAULT 'pending',
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  time_segment time_segment NOT NULL DEFAULT 'FULL',
  meeting_start TIMESTAMPTZ,
  meeting_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ
);

-- Reservation overrides (for releasing or assigning specific days)
CREATE TABLE reservation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  override_type override_type NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reservation_id, date)
);

-- Ratings table
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cell_id UUID NOT NULL REFERENCES room_cells(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workspace tips table
CREATE TABLE workspace_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default workspace tips
INSERT INTO workspace_tips (text, category) VALUES
  ('Leave the desk as you''d like to find it tomorrow.', 'cleanliness'),
  ('Keep cables tidy to avoid accidents and help the next user.', 'organization'),
  ('Avoid strong smells (food, perfume) in shared spaces.', 'respect'),
  ('Use headphones for calls and music to respect others'' focus.', 'noise'),
  ('Wipe the desk surface at the end of the day.', 'cleanliness'),
  ('Take short breaks away from the desk to recharge without disturbing others.', 'health');

-- Create indexes for better performance
CREATE INDEX idx_reservations_user ON reservations(user_id);
CREATE INDEX idx_reservations_dates ON reservations(date_start, date_end);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_room_cells_room ON room_cells(room_id);
CREATE INDEX idx_room_access_user ON room_access(user_id);
CREATE INDEX idx_room_access_room ON room_access(room_id);

-- Insert a default superadmin user (username: admin, password: admin123)
INSERT INTO users (username, password, full_name, role) 
VALUES ('admin', 'admin123', 'System Administrator', 'super_admin');
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_tips ENABLE ROW LEVEL SECURITY;

-- Create a session storage table for custom auth
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user ID from custom header
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  session_token TEXT;
  user_id_result UUID;
BEGIN
  -- Get session token from request headers
  session_token := current_setting('request.headers', true)::json->>'x-session-token';
  
  IF session_token IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Look up user_id from valid session
  SELECT user_id INTO user_id_result
  FROM user_sessions
  WHERE session_token = get_current_user_id.session_token
    AND expires_at > now();
  
  RETURN user_id_result;
END;
$$;

-- Helper function to check if user has a specific role
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
  FROM users
  WHERE id = get_current_user_id()
    AND is_active = true;
  
  RETURN user_role = check_role OR user_role = 'super_admin';
END;
$$;

-- Helper function to check room access
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
  current_user_id := get_current_user_id();
  
  IF current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get user's global role
  SELECT role INTO user_role
  FROM users
  WHERE id = current_user_id AND is_active = true;
  
  -- Super admins have access to all rooms
  IF user_role = 'super_admin' THEN
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

-- Users table policies (passwords visible only to super_admin)
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  USING (id = get_current_user_id());

CREATE POLICY "Super admins can view all users"
  ON users FOR SELECT
  USING (has_role('super_admin'));

CREATE POLICY "Super admins can manage users"
  ON users FOR ALL
  USING (has_role('super_admin'));

-- Rooms table policies
CREATE POLICY "Admins can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (has_role('admin') OR has_role('super_admin'));

CREATE POLICY "Users can view rooms they have access to"
  ON rooms FOR SELECT
  USING (has_room_access(id));

CREATE POLICY "Room creators and admins can update rooms"
  ON rooms FOR UPDATE
  USING (created_by = get_current_user_id() OR has_role('super_admin'));

CREATE POLICY "Room creators and admins can delete rooms"
  ON rooms FOR DELETE
  USING (created_by = get_current_user_id() OR has_role('super_admin'));

-- Room access policies
CREATE POLICY "Admins can manage room access"
  ON room_access FOR ALL
  USING (
    has_role('super_admin') OR
    EXISTS (
      SELECT 1 FROM room_access ra
      WHERE ra.room_id = room_access.room_id
        AND ra.user_id = get_current_user_id()
        AND ra.role = 'admin'
    )
  );

CREATE POLICY "Users can view room access for accessible rooms"
  ON room_access FOR SELECT
  USING (has_room_access(room_id));

-- Room cells policies
CREATE POLICY "Users can view cells in accessible rooms"
  ON room_cells FOR SELECT
  USING (has_room_access(room_id));

CREATE POLICY "Room admins can manage cells"
  ON room_cells FOR ALL
  USING (
    has_role('super_admin') OR
    EXISTS (
      SELECT 1 FROM room_access
      WHERE room_id = room_cells.room_id
        AND user_id = get_current_user_id()
        AND role = 'admin'
    )
  );

-- Reservations policies
CREATE POLICY "Users can create their own reservations"
  ON reservations FOR INSERT
  WITH CHECK (user_id = get_current_user_id() AND has_room_access(room_id));

CREATE POLICY "Users can view reservations in accessible rooms"
  ON reservations FOR SELECT
  USING (has_room_access(room_id));

CREATE POLICY "Users can update their own reservations"
  ON reservations FOR UPDATE
  USING (user_id = get_current_user_id());

CREATE POLICY "Admins can manage reservations"
  ON reservations FOR ALL
  USING (
    has_role('super_admin') OR
    EXISTS (
      SELECT 1 FROM room_access
      WHERE room_id = reservations.room_id
        AND user_id = get_current_user_id()
        AND role = 'admin'
    )
  );

-- Reservation overrides policies
CREATE POLICY "Reservation owners can manage overrides"
  ON reservation_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM reservations
      WHERE id = reservation_overrides.reservation_id
        AND user_id = get_current_user_id()
    )
  );

CREATE POLICY "Users can view overrides for accessible rooms"
  ON reservation_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.id = reservation_overrides.reservation_id
        AND has_room_access(r.room_id)
    )
  );

-- Ratings policies
CREATE POLICY "Users can create ratings"
  ON ratings FOR INSERT
  WITH CHECK (from_user_id = get_current_user_id());

CREATE POLICY "Users can view ratings"
  ON ratings FOR SELECT
  USING (
    from_user_id = get_current_user_id() OR
    to_user_id = get_current_user_id() OR
    has_room_access(room_id)
  );

-- Workspace tips policies (public read)
CREATE POLICY "Anyone can view workspace tips"
  ON workspace_tips FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage workspace tips"
  ON workspace_tips FOR ALL
  USING (has_role('super_admin'));

-- User sessions policies
CREATE POLICY "Users can view their own sessions"
  ON user_sessions FOR SELECT
  USING (user_id = get_current_user_id());

CREATE POLICY "System can create sessions"
  ON user_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete their own sessions"
  ON user_sessions FOR DELETE
  USING (user_id = get_current_user_id());

-- Create index for session lookups
CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_expiry ON user_sessions(expires_at);
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
-- Enable realtime for reservations table
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
-- Fix infinite recursion in room_access RLS policies
-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Admins can manage room access" ON room_access;
DROP POLICY IF EXISTS "Users can view room access for accessible rooms" ON room_access;

-- Create new policies without recursion
-- Super admins can do everything
CREATE POLICY "Super admins can manage room access"
ON room_access
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = get_current_user_id()
    AND users.role = 'super_admin'
    AND users.is_active = true
  )
);

-- Room admins can manage access for their rooms
CREATE POLICY "Room admins can manage access"
ON room_access
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM room_access ra
    WHERE ra.room_id = room_access.room_id
    AND ra.user_id = get_current_user_id()
    AND ra.role = 'admin'
  )
);

-- Users can view their own room access entries
CREATE POLICY "Users can view their own room access"
ON room_access
FOR SELECT
TO authenticated
USING (user_id = get_current_user_id());
-- Step 1: Update all super_admin users to admin and auto-approve pending reservations
UPDATE users SET role = 'admin'::app_role WHERE role = 'super_admin'::app_role;

UPDATE reservations 
SET status = 'approved'::reservation_status,
    approved_at = now(),
    approved_by = user_id
WHERE status = 'pending'::reservation_status;

-- Step 2: Drop ALL policies that depend on users.role column across all tables
-- Users table
DROP POLICY IF EXISTS "Allow login authentication" ON users;
DROP POLICY IF EXISTS "Super admins can view all users" ON users;
DROP POLICY IF EXISTS "Super admins can insert users" ON users;
DROP POLICY IF EXISTS "Super admins can update users" ON users;
DROP POLICY IF EXISTS "Super admins can delete users" ON users;
DROP POLICY IF EXISTS "Users can view their own profile" ON users;

-- Room access table
DROP POLICY IF EXISTS "Super admins can manage room access" ON room_access;
DROP POLICY IF EXISTS "Room admins can manage access" ON room_access;
DROP POLICY IF EXISTS "Users can view their own room access" ON room_access;

-- Rooms table
DROP POLICY IF EXISTS "Admins can create rooms" ON rooms;
DROP POLICY IF EXISTS "Room creators and admins can delete rooms" ON rooms;
DROP POLICY IF EXISTS "Room creators and admins can update rooms" ON rooms;
DROP POLICY IF EXISTS "Users can view rooms they have access to" ON rooms;

-- Room cells table
DROP POLICY IF EXISTS "Room admins can manage cells" ON room_cells;
DROP POLICY IF EXISTS "Users can view cells in accessible rooms" ON room_cells;

-- Reservations table
DROP POLICY IF EXISTS "Admins can manage reservations" ON reservations;
DROP POLICY IF EXISTS "Users can create their own reservations" ON reservations;
DROP POLICY IF EXISTS "Users can update their own reservations" ON reservations;
DROP POLICY IF EXISTS "Users can view reservations in accessible rooms" ON reservations;

-- Workspace tips table
DROP POLICY IF EXISTS "Admins can manage workspace tips" ON workspace_tips;
DROP POLICY IF EXISTS "Anyone can view workspace tips" ON workspace_tips;

-- Step 3: Remove default from role column
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;

-- Step 4: Create new enum without super_admin
CREATE TYPE app_role_new AS ENUM ('admin', 'user');

-- Step 5: Change users.role column to use new enum
ALTER TABLE users 
  ALTER COLUMN role TYPE app_role_new 
  USING (role::text::app_role_new);

-- Step 6: Set new default
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'::app_role_new;

-- Step 7: Drop old type (will cascade to has_role function)
DROP TYPE app_role CASCADE;

-- Step 8: Rename new type to original name
ALTER TYPE app_role_new RENAME TO app_role;

-- Step 9: Recreate has_role function
CREATE OR REPLACE FUNCTION has_role(check_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users
    WHERE id = get_current_user_id()
      AND users.role = check_role
      AND is_active = true
  )
$$;

-- Step 10: Recreate ALL RLS policies

-- Users table policies
CREATE POLICY "Allow login authentication" 
ON users 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can view all users" 
ON users 
FOR SELECT 
USING (has_role('admin'::app_role));

CREATE POLICY "Admins can insert users" 
ON users 
FOR INSERT 
WITH CHECK (
  EXISTS ( 
    SELECT 1
    FROM users u
    JOIN user_sessions us ON us.user_id = u.id
    WHERE us.session_token = ((current_setting('request.headers'::text, true))::json ->> 'x-session-token'::text)
      AND us.expires_at > now() 
      AND u.role = 'admin'::app_role 
      AND u.is_active = true
  )
);

CREATE POLICY "Admins can update users" 
ON users 
FOR UPDATE 
USING (
  EXISTS ( 
    SELECT 1
    FROM users u
    JOIN user_sessions us ON us.user_id = u.id
    WHERE us.session_token = ((current_setting('request.headers'::text, true))::json ->> 'x-session-token'::text)
      AND us.expires_at > now() 
      AND u.role = 'admin'::app_role 
      AND u.is_active = true
  )
)
WITH CHECK (
  EXISTS ( 
    SELECT 1
    FROM users u
    JOIN user_sessions us ON us.user_id = u.id
    WHERE us.session_token = ((current_setting('request.headers'::text, true))::json ->> 'x-session-token'::text)
      AND us.expires_at > now() 
      AND u.role = 'admin'::app_role 
      AND u.is_active = true
  )
);

CREATE POLICY "Admins can delete users" 
ON users 
FOR DELETE 
USING (
  EXISTS ( 
    SELECT 1
    FROM users u
    JOIN user_sessions us ON us.user_id = u.id
    WHERE us.session_token = ((current_setting('request.headers'::text, true))::json ->> 'x-session-token'::text)
      AND us.expires_at > now() 
      AND u.role = 'admin'::app_role 
      AND u.is_active = true
  )
);

CREATE POLICY "Users can view their own profile" 
ON users 
FOR SELECT 
USING (id = get_current_user_id());

-- Room access policies
CREATE POLICY "Admins can manage room access" 
ON room_access 
FOR ALL 
USING (
  EXISTS ( 
    SELECT 1
    FROM users
    WHERE users.id = get_current_user_id() 
      AND users.role = 'admin'::app_role 
      AND users.is_active = true
  )
);

CREATE POLICY "Room admins can manage access" 
ON room_access 
FOR ALL 
USING (
  EXISTS ( 
    SELECT 1
    FROM room_access ra
    WHERE ra.room_id = room_access.room_id 
      AND ra.user_id = get_current_user_id() 
      AND ra.role = 'admin'::room_role
  )
);

CREATE POLICY "Users can view their own room access" 
ON room_access 
FOR SELECT 
USING (user_id = get_current_user_id());

-- Rooms policies
CREATE POLICY "Admins can create rooms" 
ON rooms 
FOR INSERT 
WITH CHECK (has_role('admin'::app_role));

CREATE POLICY "Room creators and admins can delete rooms" 
ON rooms 
FOR DELETE 
USING (created_by = get_current_user_id() OR has_role('admin'::app_role));

CREATE POLICY "Room creators and admins can update rooms" 
ON rooms 
FOR UPDATE 
USING (created_by = get_current_user_id() OR has_role('admin'::app_role));

CREATE POLICY "Users can view rooms they have access to" 
ON rooms 
FOR SELECT 
USING (has_room_access(id));

-- Room cells policies
CREATE POLICY "Room admins can manage cells" 
ON room_cells 
FOR ALL 
USING (
  has_role('admin'::app_role) OR 
  (EXISTS ( 
    SELECT 1
    FROM room_access
    WHERE room_access.room_id = room_cells.room_id 
      AND room_access.user_id = get_current_user_id() 
      AND room_access.role = 'admin'::room_role
  ))
);

CREATE POLICY "Users can view cells in accessible rooms" 
ON room_cells 
FOR SELECT 
USING (has_room_access(room_id));

-- Reservations policies
CREATE POLICY "Admins can manage reservations" 
ON reservations 
FOR ALL 
USING (
  has_role('admin'::app_role) OR 
  (EXISTS ( 
    SELECT 1
    FROM room_access
    WHERE room_access.room_id = reservations.room_id 
      AND room_access.user_id = get_current_user_id() 
      AND room_access.role = 'admin'::room_role
  ))
);

CREATE POLICY "Users can create their own reservations" 
ON reservations 
FOR INSERT 
WITH CHECK (user_id = get_current_user_id() AND has_room_access(room_id));

CREATE POLICY "Users can update their own reservations" 
ON reservations 
FOR UPDATE 
USING (user_id = get_current_user_id());

CREATE POLICY "Users can view reservations in accessible rooms" 
ON reservations 
FOR SELECT 
USING (has_room_access(room_id));

-- Workspace tips policies
CREATE POLICY "Admins can manage workspace tips" 
ON workspace_tips 
FOR ALL 
USING (has_role('admin'::app_role));

CREATE POLICY "Anyone can view workspace tips" 
ON workspace_tips 
FOR SELECT 
USING (true);
-- Create table for fixed desk assignments
CREATE TABLE public.fixed_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cell_id UUID NOT NULL REFERENCES public.room_cells(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (date_end >= date_start),
  CONSTRAINT max_one_year CHECK (date_end <= date_start + INTERVAL '1 year')
);

-- Enable RLS
ALTER TABLE public.fixed_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can manage all fixed assignments
CREATE POLICY "Admins can manage fixed assignments"
ON public.fixed_assignments
FOR ALL
USING (has_role('admin'::app_role))
WITH CHECK (has_role('admin'::app_role));

-- Users can view fixed assignments in rooms they have access to
CREATE POLICY "Users can view fixed assignments in accessible rooms"
ON public.fixed_assignments
FOR SELECT
USING (has_room_access(room_id));

-- Create index for faster lookups
CREATE INDEX idx_fixed_assignments_cell_dates ON public.fixed_assignments(cell_id, date_start, date_end);
CREATE INDEX idx_fixed_assignments_assigned_to ON public.fixed_assignments(assigned_to);
