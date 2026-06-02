-- ============================================================
-- BenchBoss – TRENINGSPLAN-SEED (ukeplan frem til sommerferien)
-- Kjøres etter supabase-treningsplan-schema.sql.
-- Utgangspunkt fra øvelsesansvarlig — itereres videre i appen.
-- ============================================================

-- 1) Perioden: samme ukeplan hver uke til sommerferien (juli) ----------------
INSERT INTO training_periods (title, lead, accent, start_date, end_date, position)
VALUES (
  'Ukeplan — frem til sommerferien',
  'Samme rytme hver uke: Tirsdag ferdigheter, Torsdag dueller, Lørdag spill.',
  'sage', DATE '2026-06-02', DATE '2026-07-04', 0
)
ON CONFLICT DO NOTHING;

-- 2) Øktene (Tirsdag / Torsdag / Lørdag) ------------------------------------
INSERT INTO training_sessions (period_id, title, body, links, position)
SELECT p.id, v.title, v.body, v.links::jsonb, v.position
FROM (VALUES
  (
    'Tirsdag',
    E'Diff — Medtak, dribling, vending, pasning\n2 baner x 10–12 spillere. Sjef over ballen.\n\nDiff — 3v3 med press i rygg, SF. 9 per bane. Spille fremover.\n\nMix — Vinneren står, kort 7er, dødballer fra keeper, faste keepere.',
    '[{"label":"Medtak, dribling, vending, pasning","url":"https://tiim.no/ovelse/medtak-dribling-vending-pasning"}]',
    0
  ),
  (
    'Torsdag',
    E'Mix — Ferdighetssirkel med press til slutt. Sjef over ballen.\n\nDiff — 30 min vinneren står, 3× 3v3-baner på småmål, med faste jokere (A-spiller) per bane, spille fremover. Diff i A, B og C. 3 lag à 3 per bane.',
    '[]',
    1
  ),
  (
    'Lørdag',
    E'Diff — Utvidet barça-oppvarming. Innside/utside/såle/vendinger/finter med begge føtter. Kjegler.\n\nDiff — Eggs, 4v4 / 3v3 / 2v2 ut fra antall.\n\nMix — 4v4-turnering, korte baner, helst store mål.\n\nTverrliggerkonk og killer.',
    '[{"label":"Eggs Transition Game – 4v4 til 4v3","url":"https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3"}]',
    2
  )
) AS v(title, body, links, position)
CROSS JOIN (SELECT id FROM training_periods WHERE title = 'Ukeplan — frem til sommerferien' LIMIT 1) p;
