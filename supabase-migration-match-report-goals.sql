-- ============================================
-- Migrasjon: Kampreferat + målscorere
-- Kjør i Supabase SQL Editor
-- ============================================

-- 1. Fritekst-referat på kampen
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS report TEXT;

-- 2. Målscorere — én rad per mål for Halsen, FK til den eksisterende spillertabellen.
--    ON DELETE RESTRICT beskytter historisk statistikk: en spiller med mål
--    kan ikke slettes uten at målene først flyttes/fjernes.
CREATE TABLE IF NOT EXISTS match_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_goals_match ON match_goals(match_id);
CREATE INDEX IF NOT EXISTS idx_match_goals_player ON match_goals(player_id);

-- RLS med allow_all-policy (matcher mønsteret til de andre tabellene).
-- Dette dismisser advisor-warning; ekte sikkerhet krever Supabase Auth-migrasjon.
ALTER TABLE match_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON match_goals FOR ALL TO public USING (true) WITH CHECK (true);
