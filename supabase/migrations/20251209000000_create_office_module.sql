-- Create offices table
CREATE TABLE offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  is_shared BOOLEAN DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create office_bookings table
CREATE TABLE office_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_admin_block BOOLEAN DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT valid_admin_block CHECK (
    (is_admin_block = true AND user_id IS NULL) OR 
    (is_admin_block = false AND user_id IS NOT NULL)
  )
);

-- Create indexes for better performance
CREATE INDEX idx_offices_shared ON offices(is_shared);
CREATE INDEX idx_office_bookings_office ON office_bookings(office_id);
CREATE INDEX idx_office_bookings_user ON office_bookings(user_id);
CREATE INDEX idx_office_bookings_times ON office_bookings(start_time, end_time);

-- Enable Row Level Security
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_bookings ENABLE ROW LEVEL SECURITY;

-- Note: This project uses custom authentication via Edge Functions
-- RLS policies are bypassed by using service role key in Edge Functions
-- Access control is handled in the Edge Function layer
