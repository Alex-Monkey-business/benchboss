-- ============================================
-- Halsen G2015 Dommerutlegg - Database Schema
-- Kjør dette i Supabase SQL Editor
-- ============================================

-- 1. Trenere
CREATE TABLE coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Sesonger
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Kamper
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round TEXT,
  match_date DATE NOT NULL,
  match_day TEXT,
  match_time TIME,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  division TEXT,
  referee TEXT,
  fee_amount INTEGER NOT NULL DEFAULT 200,
  home_score INTEGER,
  away_score INTEGER,
  report TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Trenere per kamp (mange-til-mange)
CREATE TABLE match_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  UNIQUE(match_id, coach_id)
);

-- 5. Utlegg (én per kamp)
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  paid_by UUID NOT NULL REFERENCES coaches(id),
  amount INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(match_id)
);

-- 6. Dommere (med telefon for Vipps/Ring/SMS)
CREATE TABLE referees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Hospitanter (G2015-spillere)
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  primary_team TEXT CHECK (primary_team IN ('gronn', 'rod', 'hvit')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Hospitanter per kamp (mange-til-mange)
CREATE TABLE match_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE(match_id, player_id)
);

-- 9. Målscorere per kamp (én rad per mål for Halsen)
CREATE TABLE match_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indekser
CREATE INDEX idx_matches_season ON matches(season_id);
CREATE INDEX idx_matches_date ON matches(match_date);
CREATE INDEX idx_expenses_match ON expenses(match_id);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX idx_match_coaches_match ON match_coaches(match_id);
CREATE INDEX idx_match_players_match ON match_players(match_id);
CREATE INDEX idx_match_players_player ON match_players(player_id);
CREATE INDEX idx_match_goals_match ON match_goals(match_id);
CREATE INDEX idx_match_goals_player ON match_goals(player_id);

-- RLS aktivert med allow_all-policy. Dette dismisser Supabase advisor-warning,
-- men gir IKKE ekte sikkerhet — anon-nøkkelen kan fortsatt lese/skrive alt.
-- Ekte sikkerhet krever migrasjon til Supabase Auth (e-post/magic link) +
-- policies basert på auth.uid(). Se memo "Supabase Auth migration".
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all ON coaches FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON seasons FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON matches FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON match_coaches FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON expenses FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON referees FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON players FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON match_players FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON match_goals FOR ALL TO public USING (true) WITH CHECK (true);

-- Seed trenere (PIN: enkel 4-sifret kode, lagret som tekst)
-- Endre PIN-kodene til det dere vil bruke!
INSERT INTO coaches (name, pin) VALUES
  ('Alex',  '1234'),
  ('Iver',  '2345'),
  ('Trond', '3456'),
  ('Simon', '4567'),
  ('Jacob', '5678');

-- Opprett første sesong
INSERT INTO seasons (name) VALUES ('Vår 2025');

-- Seed dommere (telefonnummer fylles inn i appen under Mer → Dommere)
INSERT INTO referees (name) VALUES
  ('Filip HF'),
  ('Ludvik TS'),
  ('Fredrik V'),
  ('Olav J'),
  ('Samuel');
