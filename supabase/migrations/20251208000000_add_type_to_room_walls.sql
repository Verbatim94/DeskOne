-- Add type column to room_walls
ALTER TABLE public.room_walls 
ADD COLUMN type TEXT NOT NULL DEFAULT 'wall' 
CHECK (type IN ('wall', 'entrance'));

-- Comment on column
COMMENT ON COLUMN public.room_walls.type IS 'Type of the wall element: "wall" (standard blue line) or "entrance" (special marker)';
