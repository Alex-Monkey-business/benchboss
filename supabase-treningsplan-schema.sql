-- ============================================================
-- BenchBoss – TRENINGSPLAN (perioder → økter med lenker)
-- Internt trenerverktøy under Admin, ved siden av trener-håndboken.
-- Redigerbart i appen. Egen "verden" – rører ikke matches/cup/seasons.
-- Kjør i Supabase SQL Editor etter det opprinnelige supabase-schema.sql.
-- ============================================================

-- En treningsperiode – "plan over tid" (f.eks. «Juni — avslutning foran mål»)
CREATE TABLE IF NOT EXISTS training_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  lead        TEXT,                       -- kort ingress (vises på kortet)
  accent      TEXT NOT NULL DEFAULT 'warm'
              CHECK (accent IN ('warm', 'sage', 'cornflower', 'peach', 'sky', 'olive')),
  start_date  DATE,
  end_date    DATE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Økter i en periode. Lenker (YouTube, tiim.no …) som JSONB-array: [{ label, url }]
CREATE TABLE IF NOT EXISTS training_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id   UUID NOT NULL REFERENCES training_periods(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT,                          -- beskrivelse (limes fra Messenger)
  links       JSONB NOT NULL DEFAULT '[]',
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_period ON training_sessions(period_id);

-- ============================================================
-- RLS: samme allow_all-mønster som resten av appen (bevisst gjeld,
-- ekte fiks krever Supabase Auth-migrering). PIN-en er kun app-tilgang.
-- ============================================================
ALTER TABLE training_periods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all ON training_periods  FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON training_sessions FOR ALL TO public USING (true) WITH CHECK (true);
