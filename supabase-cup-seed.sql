-- ============================================================
-- BenchBoss – CUP-SEED (Bø Sommerland Cup)
-- Kjøres etter supabase-cup-schema.sql.
-- ============================================================

-- 1) Selve cupen ------------------------------------------------------------
INSERT INTO cups (name, venue, start_date, end_date)
VALUES ('Bø Sommerland Cup', 'Telemark', DATE '2026-06-06', DATE '2026-06-07')
ON CONFLICT DO NOTHING;

-- 2) Cup-kampprogram --------------------------------------------------------
INSERT INTO cup_matches (cup_id, our_team, opponent, match_date, match_time, pitch, round)
SELECT c.id, v.our_team, v.opponent, v.match_date, v.match_time, v.pitch, v.round
FROM (VALUES
  -- Halsen IF Han (G11 - 7 / G)
  ('han',  'Ski IL Fotball Juniors', DATE '2026-06-06', TIME '10:40', 'T7 3 Telemarkshallen', 'Kamp 68'),
  ('han',  'Birkenes IL',            DATE '2026-06-06', TIME '12:40', 'T7 2 Telemarkshallen', 'Kamp 109'),
  ('han',  'Siljan IL',              DATE '2026-06-07', TIME '12:40', 'T7 2 Telemarkshallen', 'Kamp 329'),
  -- Halsen IF Goat (G11 - 7 / H)
  ('goat', 'Sørfjell IL',            DATE '2026-06-06', TIME '14:40', 'T7 1 Telemarkshallen', 'Kamp 148'),
  ('goat', 'Siggerud IL',            DATE '2026-06-06', TIME '16:00', 'T7 2 Telemarkshallen', 'Kamp 177'),
  ('goat', 'Skrim Silver',           DATE '2026-06-07', TIME '13:20', 'S7 1 Sandvoll',        'Kamp 333')
) AS v(our_team, opponent, match_date, match_time, pitch, round)
CROSS JOIN (SELECT id FROM cups WHERE name = 'Bø Sommerland Cup' LIMIT 1) c;
