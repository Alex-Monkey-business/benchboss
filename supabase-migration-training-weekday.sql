-- ============================================
-- Migrasjon: Treningsøkter — ukedag
-- Kjør dette i Supabase SQL Editor
-- ============================================

-- Ukedag for økten, ISO-konvensjon: 1 = mandag … 7 = søndag.
-- (JS-konvertering: ((d.getDay() + 6) % 7) + 1 — se src/lib/dateLabels.js)
-- Nullable med vilje: en økt uten ukedag matcher aldri «i dag» på hjem-skjermen.
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS weekday INT CHECK (weekday BETWEEN 1 AND 7);

-- Backfill fra tittel der øktene heter «Tirsdag», «Torsdag» osv. Idempotent.
UPDATE training_sessions SET weekday = CASE
  WHEN lower(title) LIKE 'mandag%'  THEN 1
  WHEN lower(title) LIKE 'tirsdag%' THEN 2
  WHEN lower(title) LIKE 'onsdag%'  THEN 3
  WHEN lower(title) LIKE 'torsdag%' THEN 4
  WHEN lower(title) LIKE 'fredag%'  THEN 5
  WHEN lower(title) LIKE 'lørdag%'  THEN 6
  WHEN lower(title) LIKE 'lordag%'  THEN 6
  WHEN lower(title) LIKE 'søndag%'  THEN 7
  WHEN lower(title) LIKE 'sondag%'  THEN 7
END
WHERE weekday IS NULL;
