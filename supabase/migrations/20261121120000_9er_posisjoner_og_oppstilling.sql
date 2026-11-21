-- 9er-posisjoner og laget på banen (Alex, 21. nov 2026).
--
-- 1. Posisjonene utvides: venstre/høyre back, stopper, venstre/høyre ving.
--    `sentral` og `angrep` (Spiss) beholdes. De gamle grove `forsvar` og
--    `ving` er fortsatt lovlige: de står på spillerne til en trener bytter dem
--    ut. Bare utvidelse, så appen som kjører nå skriver fortsatt gyldige rader
--    — migrasjonen kan kjøres før deployen uten å knekke noe.
alter table public.players drop constraint if exists players_positions_check;
alter table public.players
  add constraint players_positions_check
  check (positions <@ array[
    'keeper',
    'venstre_back', 'stopper', 'hoyre_back',
    'venstre_ving', 'sentral', 'hoyre_ving',
    'angrep',
    'forsvar', 'ving'
  ]::text[]);

-- 2. Appen plasserer spillerne på banen selv ut fra posisjonene, treneren
--    justerer. Justeringene deles mellom trenerne:
--    { "<spillform>": { "<slot>": "<player id>" } }, f.eks. { "9": { "gk": "…" } }.
--    Per spillform, så en 7er-oppstilling ikke ødelegges når kullet går til 9er.
--    Skrives gjennom teams sine eksisterende coach_update-policyer.
alter table public.teams
  add column if not exists oppstilling jsonb not null default '{}'::jsonb;

comment on column public.teams.oppstilling is
  'Trenerens justeringer av laget på banen: { spillform: { slot: player_id } }. Tom = appen plasserer alle.';
