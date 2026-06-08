-- ============================================
-- Migrasjon: kampklokke-minutt på mål
-- Kjør dette i Supabase SQL Editor
-- ============================================

-- Sekund på kampklokka da målet ble scoret (live-logging i match mode).
-- Null for mål lagt inn etter kampen / uten tidspunkt.
ALTER TABLE match_goals
  ADD COLUMN IF NOT EXISTS clock_seconds INTEGER;
