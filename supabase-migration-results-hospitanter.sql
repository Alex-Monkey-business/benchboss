-- ============================================
-- Migrasjon: Kampresultater + Hospitant-pool
-- Kjør i Supabase SQL Editor
-- ============================================

-- 1. Kampresultater på matches-tabellen
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS home_score INTEGER,
  ADD COLUMN IF NOT EXISTS away_score INTEGER;

-- 2. Hospitanter (G2015-spillere som spiller ekstra på andre fargelag)
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  primary_team TEXT CHECK (primary_team IN ('gronn', 'rod', 'hvit')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE(match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);

-- RLS med allow_all-policy (matcher mønsteret til de andre tabellene).
-- Dette dismisser advisor-warning; ekte sikkerhet krever Supabase Auth-migrasjon.
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON players FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON match_players FOR ALL TO public USING (true) WITH CHECK (true);
