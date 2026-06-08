-- ============================================
-- Match Mode — live spilletid & bytter
-- Kjør dette i Supabase SQL Editor
-- ============================================
--
-- Event-sourced modell. Spilletid telles ikke, men regnes ut fra:
--   1) match_sessions — kampklokka (akkumulerte spillesekunder)
--   2) match_stints   — hvert opphold på banen, lagret mot KAMPKLOKKA
--
-- Aktuell kampklokke = running
--   ? clock_base_seconds + (now() - running_since)
--   : clock_base_seconds
-- Spilletid per spiller = SUM(coalesce(off_clock, aktuell_klokke) - on_clock)

-- 1. Kampklokke (én rad per kamp som har vært i match mode)
CREATE TABLE match_sessions (
  match_id UUID PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup', 'running', 'paused', 'finished')),
  clock_base_seconds INTEGER NOT NULL DEFAULT 0,  -- frosset elapsed (oppdateres ved pause)
  running_since TIMESTAMPTZ,                       -- null når pauset/ferdig
  period INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. On-field-intervaller (event-logg per spiller, mot kampklokka)
CREATE TABLE match_stints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'field' CHECK (role IN ('field', 'keeper')),
  position TEXT,                -- formasjons-slot (gk, d1, m2, f1 …) — visuell plassering
  on_clock INTEGER NOT NULL,    -- kampklokke-sekunder ved inngang
  off_clock INTEGER,            -- kampklokke-sekunder ved utgang; null = på banen nå
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indekser
CREATE INDEX idx_match_stints_match ON match_stints(match_id);
CREATE INDEX idx_match_stints_player ON match_stints(player_id);

-- RLS — allow_all, samme som resten av schemaet. Gir IKKE ekte sikkerhet
-- (anon-nøkkelen kan lese/skrive alt). Se memo "Supabase Auth migration".
ALTER TABLE match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_stints ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all ON match_sessions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON match_stints FOR ALL TO public USING (true) WITH CHECK (true);
