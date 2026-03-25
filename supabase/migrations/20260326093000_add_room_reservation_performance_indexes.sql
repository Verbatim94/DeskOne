CREATE INDEX IF NOT EXISTS idx_reservations_room_dates_status
ON public.reservations (room_id, date_start, date_end, status);

CREATE INDEX IF NOT EXISTS idx_fixed_assignments_room_dates
ON public.fixed_assignments (room_id, date_start, date_end);
