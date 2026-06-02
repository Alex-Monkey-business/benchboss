-- ============================================================
-- BenchBoss – TRENINGSPLAN-SEED (ukeplan frem til sommerferien)
-- Kjøres etter supabase-treningsplan-schema.sql.
-- Utgangspunkt fra øvelsesansvarlig — itereres videre i appen.
-- Øvelser ligger strukturert i drills (Diff/Mix-badge + egen lenke).
-- ============================================================

-- 1) Perioden: samme ukeplan hver uke til sommerferien (juli) ----------------
INSERT INTO training_periods (title, lead, accent, start_date, end_date, position)
VALUES (
  'Ukeplan — frem til sommerferien',
  'Samme rytme hver uke: Tirsdag ferdigheter, Torsdag dueller, Lørdag spill.',
  'sage', DATE '2026-06-02', DATE '2026-07-04', 0
)
ON CONFLICT DO NOTHING;

-- 2) Øktene (Tirsdag / Torsdag / Lørdag) med øvelser ------------------------
INSERT INTO training_sessions (period_id, title, drills, position)
SELECT p.id, v.title, v.drills::jsonb, v.position
FROM (VALUES
  (
    'Tirsdag',
    '[
      {"type":"diff","text":"Medtak, dribling, vending, pasning\n2 baner x 10–12 spillere. Sjef over ballen.","link":{"label":"Medtak, dribling, vending, pasning","url":"https://tiim.no/ovelse/medtak-dribling-vending-pasning"}},
      {"type":"diff","text":"3v3 med press i rygg, SF. 9 per bane. Spille fremover.","link":null},
      {"type":"mix","text":"Vinneren står, kort 7er, dødballer fra keeper, faste keepere.","link":null}
    ]',
    0
  ),
  (
    'Torsdag',
    '[
      {"type":"mix","text":"Ferdighetssirkel med press til slutt. Sjef over ballen.","link":null},
      {"type":"diff","text":"30 min vinneren står, 3× 3v3-baner på småmål, med faste jokere (A-spiller) per bane, spille fremover. Diff i A, B og C. 3 lag à 3 per bane.","link":null}
    ]',
    1
  ),
  (
    'Lørdag',
    '[
      {"type":"diff","text":"Utvidet barça-oppvarming. Innside/utside/såle/vendinger/finter med begge føtter. Kjegler.","link":null},
      {"type":"diff","text":"Eggs, 4v4 / 3v3 / 2v2 ut fra antall.","link":{"label":"Eggs Transition Game – 4v4 til 4v3","url":"https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3"}},
      {"type":"mix","text":"4v4-turnering, korte baner, helst store mål.","link":null},
      {"type":"none","text":"Tverrliggerkonk og killer.","link":null}
    ]',
    2
  )
) AS v(title, drills, position)
CROSS JOIN (SELECT id FROM training_periods WHERE title = 'Ukeplan — frem til sommerferien' LIMIT 1) p;
