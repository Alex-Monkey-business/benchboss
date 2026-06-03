-- ============================================================
-- BenchBoss – TRENINGSPLAN-SEED (ukeplan frem til sommerferien)
-- Kjøres etter supabase-treningsplan-schema.sql.
-- Utgangspunkt fra øvelsesansvarlig — itereres videre i appen.
-- Drills: { type:'diff'|'mix'|'none', text(navn), tema(fokus), laeringsmomenter[], organisering(oppsett), link }
-- ============================================================

-- 1) Perioden -----------------------------------------------------------------
INSERT INTO training_periods (title, lead, accent, start_date, end_date, position)
VALUES (
  'Ukeplan — frem til sommerferien',
  'Sjef over ballen, grunnferdigheter og spill med mye involvering.',
  'sage', DATE '2026-06-02', DATE '2026-07-04', 0
)
ON CONFLICT DO NOTHING;

-- 2) Øktene (Tirsdag / Torsdag / Lørdag) -------------------------------------
INSERT INTO training_sessions (period_id, title, accent, illustration, focus, drills, position)
SELECT p.id, v.title, v.accent, v.illustration, v.focus, v.drills::jsonb, v.position
FROM (VALUES
  (
    'Tirsdag', 'sky', 'tuesday_june_tranparent.png',
    'Ferdigheter under press. Bli sjef over ballen i trange rom — medtak, vending og første touch som tar deg ut av presset.',
    '[
      {"type":"diff","text":"Medtak, dribling, vending og pasning","tema":"Spille oss fremover","laeringsmomenter":["Mykt medtak ut til siden — fremover på andre touch","Løft blikket og finn timing på finta","Finte med tempo og store bevegelser for å passere"],"organisering":"To og to per stasjon. Pasning gjennom port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, vending ved siste kjegle. Bytt roller.","link":{"label":"Medtak, dribling, vending, pasning","url":"https://tiim.no/ovelse/medtak-dribling-vending-pasning"}},
      {"type":"diff","text":"3v3 med press i ryggen","tema":"Fart i angrep, hold overtaket","organisering":"To baner med småmål. To forsvarere står ved eget mål; den siste starter bak angrepslagets mål og jager i press straks angriperne får ballen fra trener. Variasjon: forsvarslaget forsvarer to mål.","link":null},
      {"type":"mix","text":"Vinneren står","tema":"Tempo og lite dødtid","organisering":"To lag spiller kort 7er — ny kamp straks det er mål. De to andre roterer ved siden: ett på styrke, ett på en lettbeint øvelse.","link":null}
    ]',
    0
  ),
  (
    'Torsdag', 'peach', 'thursday_june_transparent.png',
    'Grunnferdigheter og spill. Ferdighetssirkel for å bli sjef over ballen, så smålagsspill 3v3 med mye involvering.',
    '[
      {"type":"mix","text":"Ferdighetssirkel","tema":"Sjef over ballen","organisering":"Avsluttes med press.","link":null},
      {"type":"diff","text":"Vinneren står — 3v3 på småmål","tema":"Spille fremover","organisering":"30 min. Tre baner, én fast joker (A-spiller) per bane. Differensiert i nivå A, B og C — tre lag à tre per bane.","link":null}
    ]',
    1
  ),
  (
    'Lørdag', 'olive', 'saturday_june_transparent.png',
    'Spill og mestring. Mye touch, små lag, mange mål — la dem prøve det vi har trent på.',
    '[
      {"type":"diff","text":"Utvidet Barça-oppvarming","organisering":"Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.","link":null},
      {"type":"diff","text":"Eggs (transition game)","organisering":"4v4, 3v3 eller 2v2 ut fra antall.","link":{"label":"Eggs Transition Game – 4v4 til 4v3","url":"https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3"}},
      {"type":"mix","text":"4v4-turnering","organisering":"Korte baner, helst med store mål.","link":null},
      {"type":"none","text":"Tverrliggerkonkurranse og killer","link":null}
    ]',
    2
  )
) AS v(title, accent, illustration, focus, drills, position)
CROSS JOIN (SELECT id FROM training_periods WHERE title = 'Ukeplan — frem til sommerferien' LIMIT 1) p;
