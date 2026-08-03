-- ============================================
-- Øvelsesbank — gjenbrukbare treningsøvelser
-- Kjør dette i Supabase SQL Editor FØR banken tas i bruk.
-- ============================================

-- Copy-on-add-semantikk: å legge en øvelse i en økt kopierer feltene inn i
-- øktas drills-JSONB (med exercise_id som opphav). Endringer i banken
-- påvirker derfor aldri eksisterende økter.

CREATE TABLE IF NOT EXISTS training_exercises (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'none' CHECK (type IN ('diff', 'mix', 'none')),
  tema             TEXT,
  organisering     TEXT,
  laeringsmomenter JSONB NOT NULL DEFAULT '[]',
  link             JSONB, -- { label, url } | null
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Samme bevisste RLS-gjeld som resten av appen (PIN-basert klient-auth).
ALTER TABLE training_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON training_exercises FOR ALL TO public USING (true) WITH CHECK (true);
