-- Fase 2, migrasjon 2 av 4: cohort_id på alle eksisterende tabeller.
--
-- Kolonnene legges til NULLBARE og uten trigger. Backfill skjer i migrasjon 3,
-- triggere og NOT NULL i migrasjon 4. Rekkefølgen er med vilje: en trigger som
-- står på under backfillen ville regnet ut verdien fra en forelder som selv
-- ikke er backfilt ennå.
--
-- Hvorfor denormalisere i stedet for å traversere FK-er i policyene: en
-- null-argument STABLE SECURITY DEFINER-funksjon folder til en InitPlan og
-- kjører ÉN gang per spørring. FK-traversering krever en wrapper per relasjon
-- og evalueres per rad.

-- Røtter: ingen forelder å arve fra.
alter table public.coaches           add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.players           add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.referees          add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.seasons           add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.cups              add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.training_periods  add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;

-- Nivå 1: arver fra en rot.
alter table public.matches             add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.cup_matches         add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.cup_squad           add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.player_season_teams add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.training_sessions   add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;

-- Nivå 2: arver fra matches / cup_matches.
alter table public.expenses         add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.match_players    add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.match_coaches    add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.match_goals      add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.match_absences   add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.match_sessions   add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.match_stints     add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;
alter table public.cup_match_goals  add column if not exists cohort_id uuid references public.cohorts(id) on delete restrict;

-- Øvelsesbanken er den ene tabellen som IKKE er kull-eid. Den deles på klubb,
-- så G2017 arver den uten å kopiere noe.
alter table public.training_exercises add column if not exists club_id uuid references public.clubs(id) on delete restrict;

comment on column public.training_exercises.club_id is
  'Øvelsesbanken deles på klubbnivå — dette er hele grunnen til at clubs finnes som eget nivå.';
