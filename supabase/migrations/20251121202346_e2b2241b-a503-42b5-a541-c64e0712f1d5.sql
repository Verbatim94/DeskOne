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