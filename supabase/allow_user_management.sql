-- Allow users to manage their OWN fixed assignments
-- This enables "Split" cancellation logic for regular users like Gianni

-- 1. Grant UPDATE permission (for shrinking date ranges)
DROP POLICY IF EXISTS "Users can update own fixed assignments" ON fixed_assignments;
CREATE POLICY "Users can update own fixed assignments"
ON fixed_assignments
FOR UPDATE
TO authenticated
USING ( assigned_to = auth.uid() )
WITH CHECK ( assigned_to = auth.uid() );

-- 2. Grant DELETE permission (for removing single-day assignments)
DROP POLICY IF EXISTS "Users can delete own fixed assignments" ON fixed_assignments;
CREATE POLICY "Users can delete own fixed assignments"
ON fixed_assignments
FOR DELETE
TO authenticated
USING ( assigned_to = auth.uid() );

-- 3. Grant INSERT permission (needed when splitting a middle day into two parts)
DROP POLICY IF EXISTS "Users can insert own fixed assignments" ON fixed_assignments;
CREATE POLICY "Users can insert own fixed assignments"
ON fixed_assignments
FOR INSERT
TO authenticated
WITH CHECK ( assigned_to = auth.uid() );
