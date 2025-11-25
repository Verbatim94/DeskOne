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