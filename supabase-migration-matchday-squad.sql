-- ============================================
-- Migrasjon: Kamptropp — egnet-merke + frafall
-- Kjør dette i Supabase SQL Editor
-- ============================================

-- 1. Egnet som lånespiller (trenervurdering — innsats/holdning)
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS loan_eligible BOOLEAN DEFAULT false;

-- 2. Frafall: spillere fra laget som er ute av en gitt kamp.
--    Unntakene lagres; kamptroppen avledes som laget minus frafall.
CREATE TABLE IF NOT EXISTS match_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_match_absences_match ON match_absences(match_id);

-- RLS — allow_all, samme som resten av schemaet.
ALTER TABLE match_absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON match_absences FOR ALL TO public USING (true) WITH CHECK (true);
