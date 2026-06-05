CREATE TABLE IF NOT EXISTS office_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (office_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_office_access_office ON office_access(office_id);
CREATE INDEX IF NOT EXISTS idx_office_access_user ON office_access(user_id);

ALTER TABLE office_access ENABLE ROW LEVEL SECURITY;
