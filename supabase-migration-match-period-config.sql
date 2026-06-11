-- ============================================
-- Match mode: kamplengde-config per kamp
-- Kjør dette i Supabase SQL Editor
-- ============================================
--
-- Antall omganger og minutter per omgang settes i setup-fasen
-- (default 2×30, serieoppsettet). Cup-kamper kan da kjøre f.eks.
-- 1×15 eller 2×12 uten å røre koden. Eksisterende rader backfylles
-- med default.

ALTER TABLE match_sessions
  ADD COLUMN IF NOT EXISTS period_count INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS period_minutes INTEGER NOT NULL DEFAULT 30;
