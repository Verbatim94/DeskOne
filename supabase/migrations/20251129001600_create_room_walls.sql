-- Create table for room walls (borders between cells)
CREATE TABLE public.room_walls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  start_row INTEGER NOT NULL,
  start_col INTEGER NOT NULL,
  end_row INTEGER NOT NULL,
  end_col INTEGER NOT NULL,
  orientation TEXT NOT NULL CHECK (orientation IN ('horizontal', 'vertical')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_wall UNIQUE(room_id, start_row, start_col, end_row, end_col)
);

-- Enable RLS
ALTER TABLE public.room_walls ENABLE ROW LEVEL SECURITY;

-- Admins can manage all walls
CREATE POLICY "Admins can manage walls"
ON public.room_walls
FOR ALL
USING (has_role('admin'::app_role))
WITH CHECK (has_role('admin'::app_role));

-- Users can view walls in rooms they have access to
CREATE POLICY "Users can view walls in accessible rooms"
ON public.room_walls
FOR SELECT
USING (has_room_access(room_id));

-- Create index for faster lookups
CREATE INDEX idx_room_walls_room ON public.room_walls(room_id);
