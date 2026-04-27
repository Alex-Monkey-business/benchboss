-- Kjør dette i Supabase SQL Editor for å opprette dommer-tabellen.
-- ============================================
CREATE TABLE IF NOT EXISTS referees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE referees DISABLE ROW LEVEL SECURITY;

-- Seed de 5 kjente dommerne (telefon fylles inn i appen)
INSERT INTO referees (name) VALUES
  ('Filip HF'),
  ('Ludvik TS'),
  ('Fredrik V'),
  ('Olav J'),
  ('Samuel')
ON CONFLICT (name) DO NOTHING;
