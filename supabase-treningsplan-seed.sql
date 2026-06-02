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
INSERT INTO training_sessions (period_id, title, accent, focus, drills, position)
SELECT p.id, v.title, v.accent, v.focus, v.drills::jsonb, v.position
FROM (VALUES
  (
    'Tirsdag',
    'sky',
    'Ferdigheter under press. Bli sjef over ballen i trange rom — medtak, vending og første touch som tar deg ut av presset.',
    '[
      {"type":"diff","text":"Medtak, dribling, vending og pasning. To baner med 10–12 spillere på hver. Vær sjef over ballen.","link":{"label":"Medtak, dribling, vending, pasning","url":"https://tiim.no/ovelse/medtak-dribling-vending-pasning"}},
      {"type":"diff","text":"3v3 med press i ryggen. Ni spillere per bane. Spill fremover.","link":null},
      {"type":"mix","text":"Vinneren står. Korte 7er-baner, dødballer fra keeper og faste keepere.","link":null}
    ]',
    0
  ),
  (
    'Torsdag',
    'peach',
    'Dueller og mot. Vinn ballen i 1v1, og spill fremover med en gang du har den.',
    '[
      {"type":"mix","text":"Ferdighetssirkel som avsluttes med press. Vær sjef over ballen.","link":null},
      {"type":"diff","text":"30 minutter med «vinneren står». Tre 3v3-baner på småmål med én fast joker (A-spiller) på hver bane. Spill fremover. Differensiert i nivå A, B og C — tre lag à tre spillere per bane.","link":null}
    ]',
    1
  ),
  (
    'Lørdag',
    'olive',
    'Spill og mestring. Mye touch, små lag, mange mål — la dem prøve det vi har trent på.',
    '[
      {"type":"diff","text":"Utvidet Barça-oppvarming. Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.","link":null},
      {"type":"diff","text":"Eggs (transition game). 4v4, 3v3 eller 2v2 ut fra hvor mange som er på trening.","link":{"label":"Eggs Transition Game – 4v4 til 4v3","url":"https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3"}},
      {"type":"mix","text":"4v4-turnering på korte baner, helst med store mål.","link":null},
      {"type":"none","text":"Avslutt med tverrliggerkonkurranse og killer.","link":null}
    ]',
    2
  )
) AS v(title, accent, focus, drills, position)
CROSS JOIN (SELECT id FROM training_periods WHERE title = 'Ukeplan — frem til sommerferien' LIMIT 1) p;
