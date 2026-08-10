-- ============================================
-- Migrasjon: Lagtilhørighet per sesong
-- Kjør dette i Supabase SQL Editor
-- ============================================
--
-- Troppene rulleres mellom sesongene. Fram til nå har lagtilhørigheten bodd
-- i players.primary_team — én kolonne som bare kjenner NÅ. Når lagene settes
-- på nytt, endres derfor også fortiden: vårens kamper og toppscorerlister
-- ville vist høstens lagfarger.
--
-- Denne tabellen holder på hvilket lag en spiller hørte til i en gitt sesong.
-- players.primary_team beholdes som «laget akkurat nå», slik at kampflyten og
-- match mode fortsetter uendret — sesongtabellen er for historikken.

CREATE TABLE IF NOT EXISTS player_season_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id     UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  team          TEXT CHECK (team IN ('gronn', 'rod', 'hvit')),
  loan_eligible BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, season_id)
);

CREATE INDEX IF NOT EXISTS player_season_teams_season_idx
  ON player_season_teams (season_id);

ALTER TABLE player_season_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all ON player_season_teams;
CREATE POLICY allow_all ON player_season_teams FOR ALL TO public USING (true) WITH CHECK (true);
