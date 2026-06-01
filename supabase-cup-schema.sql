-- ============================================================
-- BenchBoss – CUP-MODUL (kampoversikt)
-- Egen "cup-verden" atskilt fra serien (seasons/matches røres ikke).
-- Read-only oversikt: trenere ser den under «Cup», foreldre via foreldre-PIN.
-- Kjør i Supabase SQL Editor etter det opprinnelige supabase-schema.sql.
-- ============================================================

-- En cup (f.eks. Bø Sommerland Cup) – en helgegreie, kan stå som historikk etterpå.
CREATE TABLE IF NOT EXISTS cups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  venue       TEXT,
  start_date  DATE,
  end_date    DATE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Cup-kamper (lesbart program – egne kamper, rører ikke matches/serien)
CREATE TABLE IF NOT EXISTS cup_matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cup_id      UUID NOT NULL REFERENCES cups(id) ON DELETE CASCADE,
  our_team    TEXT NOT NULL CHECK (our_team IN ('goat', 'han')),
  opponent    TEXT,
  match_date  DATE,
  match_time  TIME,
  pitch       TEXT,
  round       TEXT,
  home_score  INTEGER,
  away_score  INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cup_matches_cup ON cup_matches(cup_id);

-- ============================================================
-- RLS: samme allow_all-mønster som resten av appen (bevisst gjeld,
-- ekte fiks krever Supabase Auth-migrering). PIN-en er kun app-tilgang.
-- ============================================================
ALTER TABLE cups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cup_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all ON cups        FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON cup_matches FOR ALL TO public USING (true) WITH CHECK (true);
