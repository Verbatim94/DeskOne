-- Delete ALL reservations from the database
-- WARNING: This will permanently delete all reservation data
-- Use with caution!

DELETE FROM public.reservations;

-- Optional: Also delete all fixed assignments
-- Uncomment the line below if you want to delete fixed assignments too
-- DELETE FROM public.fixed_assignments;
