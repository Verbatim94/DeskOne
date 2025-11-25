-- Create enum for user roles
CREATE TYPE app_role AS ENUM ('super_admin', 'admin', 'user');

-- Create enum for desk types
CREATE TYPE desk_type AS ENUM ('empty', 'desk', 'premium_desk', 'office', 'entrance', 'wall');

-- Create enum for reservation types
CREATE TYPE reservation_type AS ENUM ('half_day', 'day', 'week', 'month', 'quarter', 'semester', 'meeting');

-- Create enum for reservation status
CREATE TYPE reservation_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- Create enum for time segments
CREATE TYPE time_segment AS ENUM ('AM', 'PM', 'FULL');

-- Create enum for override types
CREATE TYPE override_type AS ENUM ('released', 'assigned');

-- Create enum for room access roles
CREATE TYPE room_role AS ENUM ('admin', 'member');

-- Users table (custom auth, not Supabase Auth)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  grid_width INTEGER NOT NULL CHECK (grid_width > 0 AND grid_width <= 50),
  grid_height INTEGER NOT NULL CHECK (grid_height > 0 AND grid_height <= 50),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Room access table (who can see/manage rooms)
CREATE TABLE room_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role room_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Room cells (grid positions in a room)
CREATE TABLE room_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  type desk_type NOT NULL DEFAULT 'empty',
  label TEXT,
  default_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, x, y)
);

-- Reservations table
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cell_id UUID NOT NULL REFERENCES room_cells(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type reservation_type NOT NULL,
  status reservation_status NOT NULL DEFAULT 'pending',
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  time_segment time_segment NOT NULL DEFAULT 'FULL',
  meeting_start TIMESTAMPTZ,
  meeting_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ
);

-- Reservation overrides (for releasing or assigning specific days)
CREATE TABLE reservation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  override_type override_type NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reservation_id, date)
);

-- Ratings table
CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cell_id UUID NOT NULL REFERENCES room_cells(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workspace tips table
CREATE TABLE workspace_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default workspace tips
INSERT INTO workspace_tips (text, category) VALUES
  ('Leave the desk as you''d like to find it tomorrow.', 'cleanliness'),
  ('Keep cables tidy to avoid accidents and help the next user.', 'organization'),
  ('Avoid strong smells (food, perfume) in shared spaces.', 'respect'),
  ('Use headphones for calls and music to respect others'' focus.', 'noise'),
  ('Wipe the desk surface at the end of the day.', 'cleanliness'),
  ('Take short breaks away from the desk to recharge without disturbing others.', 'health');

-- Create indexes for better performance
CREATE INDEX idx_reservations_user ON reservations(user_id);
CREATE INDEX idx_reservations_dates ON reservations(date_start, date_end);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_room_cells_room ON room_cells(room_id);
CREATE INDEX idx_room_access_user ON room_access(user_id);
CREATE INDEX idx_room_access_room ON room_access(room_id);

-- Insert a default superadmin user (username: admin, password: admin123)
INSERT INTO users (username, password, full_name, role) 
VALUES ('admin', 'admin123', 'System Administrator', 'super_admin');