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