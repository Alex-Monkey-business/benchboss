-- Lagene en cup meldes på med, på cupen selv
--
-- Lagene har hittil vært UTLEDET av dataene: hver cup-kamp bærer sin `our_team`,
-- hver tropprad sitt `cup_team`. Det var riktig så lenge cupene ble seedet med
-- SQL — da fantes kampene før noen åpnet appen.
--
-- Nå oppretter treneren cupen selv, og da snur rekkefølgen: han melder på «Blå»
-- og «Rød» FØR han vet én eneste kamp, og skal kunne fordele troppen med det
-- samme. Utledningen har ingenting å utlede fra, og lagene finnes ikke.
--
-- Så de bor her. Formen er `[{"slug":"bla","name":"Blå"}]` — slug-en er det
-- `cup_matches.our_team` og `cup_squad.cup_team` peker på.
--
-- Gamle cuper får `[]` og fortsetter å utledes som før. Det er derfor dette er
-- en kolonne med default og ikke en backfill: Halsens to cuper er ferdigspilte,
-- og å gjette navnene deres inn i en ny kolonne ville vært å skrive om
-- historikk vi allerede viser riktig.
alter table public.cups
  add column if not exists teams jsonb not null default '[]'::jsonb;

comment on column public.cups.teams is
  'Lagene kullet stiller med i denne cupen: [{slug, name}]. Tom for cuper seedet før 31.08.2026 — de utledes fra cup_matches/cup_squad.';
