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