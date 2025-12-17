-- Enable RLS on fixed_assignments just in case
ALTER TABLE IF EXISTS fixed_assignments ENABLE ROW LEVEL SECURITY;

-- Allow ALL authenticated users to view fixed assignments
-- This fixes the issue where regular users cannot see "Blue" (Available) desks as "Reserved" (Red/Purple)
-- because they were blocked from reading the table.
DROP POLICY IF EXISTS "Anyone can view fixed assignments" ON fixed_assignments;
CREATE POLICY "Anyone can view fixed assignments"
ON fixed_assignments
FOR SELECT
TO authenticated
USING (true);

-- Allow Admins to manage everything (just in case)
DROP POLICY IF EXISTS "Admins can manage fixed assignments" ON fixed_assignments;
CREATE POLICY "Admins can manage fixed assignments"
ON fixed_assignments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);
