-- Fase 2, migrasjon 4 av 4: triggere, NOT NULL, indekser, sammensatte FK-er
-- og kull-lokal navne-unikhet.
--
-- Dette er migrasjonen som gjør cohort_id AVLEDET. Klienten sender den aldri,
-- og kan ikke forfalske den: barne-triggerne overskriver alltid det som kommer
-- inn med verdien fra forelderraden. Bonusen som avgjorde designet er at hele
-- fase 2 dermed er usynlig for den deployede frontenden — den setter inn uten
-- cohort_id, og triggeren fyller den.

-- ---------------------------------------------------------------------------
-- Trigger-funksjoner
-- ---------------------------------------------------------------------------

-- Røttene har ingen forelder å arve fra. Så lenge det finnes NØYAKTIG ett kull
-- fylles det inn, og den deployede appen fortsetter å virke uten en eneste
-- kodeendring gjennom fase 2 og 3.
--
-- I det øyeblikket kull nr. 2 finnes, feiler et insert uten cohort_id HØYT i
-- stedet for å lande stille i feil kull. Vinduet lukker seg altså selv — det er
-- ikke noe noen må huske å skru av, og feilmodusen er en feilmelding og ikke
-- data på feil sted.
create or replace function public.bb_cohort_root()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  only_cohort uuid;
begin
  if new.cohort_id is not null then
    return new;
  end if;

  -- uuid har ingen min/max-aggregat i Postgres, så antall og verdi må hentes
  -- i to steg.
  select count(*) into n from public.cohorts;

  if n = 1 then
    select id into only_cohort from public.cohorts;
    new.cohort_id := only_cohort;
  else
    raise exception 'cohort_id må settes eksplisitt på %: % kull finnes', tg_table_name, n;
  end if;

  return new;
end $$;

-- Øvelsesbanken, samme mekanikk på klubbnivå.
create or replace function public.bb_club_root()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  only_club uuid;
begin
  if new.club_id is not null then
    return new;
  end if;

  select count(*) into n from public.clubs;

  if n = 1 then
    select id into only_club from public.clubs;
    new.club_id := only_club;
  else
    raise exception 'club_id må settes eksplisitt på %: % klubber finnes', tg_table_name, n;
  end if;

  return new;
end $$;

-- Barne-triggerne. Merk at de ikke sjekker om verdien er null først — de
-- overskriver alltid. Det er hele forfalskningsvernet.
create or replace function public.bb_cohort_from_match()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cohort_id into new.cohort_id from public.matches where id = new.match_id;
  return new;
end $$;

create or replace function public.bb_cohort_from_season()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cohort_id into new.cohort_id from public.seasons where id = new.season_id;
  return new;
end $$;

create or replace function public.bb_cohort_from_cup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cohort_id into new.cohort_id from public.cups where id = new.cup_id;
  return new;
end $$;

create or replace function public.bb_cohort_from_cup_match()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cohort_id into new.cohort_id from public.cup_matches where id = new.cup_match_id;
  return new;
end $$;

create or replace function public.bb_cohort_from_player()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cohort_id into new.cohort_id from public.players where id = new.player_id;
  return new;
end $$;

create or replace function public.bb_cohort_from_period()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cohort_id into new.cohort_id from public.training_periods where id = new.period_id;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Triggere
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- røtter
      ('coaches',            'bb_cohort_root'),
      ('players',            'bb_cohort_root'),
      ('referees',           'bb_cohort_root'),
      ('seasons',            'bb_cohort_root'),
      ('cups',               'bb_cohort_root'),
      ('training_periods',   'bb_cohort_root'),
      ('training_exercises', 'bb_club_root'),
      -- nivå 1
      ('matches',             'bb_cohort_from_season'),
      ('cup_matches',         'bb_cohort_from_cup'),
      ('cup_squad',           'bb_cohort_from_cup'),
      ('player_season_teams', 'bb_cohort_from_player'),
      ('training_sessions',   'bb_cohort_from_period'),
      -- nivå 2
      ('expenses',        'bb_cohort_from_match'),
      ('match_players',   'bb_cohort_from_match'),
      ('match_coaches',   'bb_cohort_from_match'),
      ('match_goals',     'bb_cohort_from_match'),
      ('match_absences',  'bb_cohort_from_match'),
      ('match_sessions',  'bb_cohort_from_match'),
      ('match_stints',    'bb_cohort_from_match'),
      ('cup_match_goals', 'bb_cohort_from_cup_match')
    ) as v(tbl, fn)
  loop
    execute format('drop trigger if exists bb_set_owner on public.%I', r.tbl);
    execute format(
      'create trigger bb_set_owner before insert or update on public.%I for each row execute function public.%I()',
      r.tbl, r.fn
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- NOT NULL og indekser
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'coaches', 'players', 'referees', 'seasons', 'cups', 'training_periods',
    'matches', 'cup_matches', 'cup_squad', 'player_season_teams', 'training_sessions',
    'expenses', 'match_players', 'match_coaches', 'match_goals', 'match_absences',
    'match_sessions', 'match_stints', 'cup_match_goals'
  ]
  loop
    execute format('alter table public.%I alter column cohort_id set not null', t);
    execute format('create index if not exists %I on public.%I (cohort_id)', t || '_cohort_idx', t);
  end loop;
end $$;

-- Sammensatt unikhet på (cohort_id, id) er det som gjør de sammensatte FK-ene
-- under mulige. Kun på de sju tabellene som faktisk er FK-mål — match_sessions
-- har ingen id-kolonne i det hele tatt, bare match_id som primærnøkkel.
do $$
declare t text;
begin
  foreach t in array array[
    'matches', 'seasons', 'cups', 'cup_matches', 'players', 'coaches', 'training_periods'
  ]
  loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_cohort_id_id_key');
    execute format('alter table public.%I add constraint %I unique (cohort_id, id)', t, t || '_cohort_id_id_key');
  end loop;
end $$;

alter table public.training_exercises alter column club_id set not null;
create index if not exists training_exercises_club_idx on public.training_exercises (club_id);

-- FK-en cohorts ikke kunne få i migrasjon 1, fordi seasons manglet cohort_id.
alter table public.cohorts drop constraint if exists cohorts_active_season_id_fkey;
alter table public.cohorts
  add constraint cohorts_active_season_id_fkey
  foreign key (active_season_id) references public.seasons(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Sammensatte FK-er: kryss-kull-referanser blir strukturelt umulige
-- ---------------------------------------------------------------------------
--
-- Disse ligger PÅ TOPPEN av de eksisterende enkle FK-ene, som beholder sin
-- ON DELETE-oppførsel. match_goals og cup_match_goals sine spiller-FK-er er
-- RESTRICT i dag; de sammensatte speiler det, ellers svekkes vernet mot å
-- slette en spiller som har scoret.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- (barn, kolonne, forelder, on delete)
      ('matches',             'season_id',     'seasons',          'cascade'),
      ('expenses',            'match_id',      'matches',          'cascade'),
      ('expenses',            'paid_by',       'coaches',          'no action'),
      ('match_players',       'match_id',      'matches',          'cascade'),
      ('match_players',       'player_id',     'players',          'cascade'),
      ('match_coaches',       'match_id',      'matches',          'cascade'),
      ('match_coaches',       'coach_id',      'coaches',          'cascade'),
      ('match_goals',         'match_id',      'matches',          'cascade'),
      ('match_goals',         'player_id',     'players',          'restrict'),
      ('match_absences',      'match_id',      'matches',          'cascade'),
      ('match_absences',      'player_id',     'players',          'cascade'),
      ('match_sessions',      'match_id',      'matches',          'cascade'),
      ('match_stints',        'match_id',      'matches',          'cascade'),
      ('match_stints',        'player_id',     'players',          'cascade'),
      ('cup_matches',         'cup_id',        'cups',             'cascade'),
      ('cup_squad',           'cup_id',        'cups',             'cascade'),
      ('cup_squad',           'player_id',     'players',          'cascade'),
      ('cup_match_goals',     'cup_match_id',  'cup_matches',      'cascade'),
      ('cup_match_goals',     'player_id',     'players',          'restrict'),
      ('player_season_teams', 'player_id',     'players',          'cascade'),
      ('player_season_teams', 'season_id',     'seasons',          'cascade'),
      ('training_sessions',   'period_id',     'training_periods', 'cascade')
    ) as v(child, col, parent, on_del)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.child, r.child || '_' || r.col || '_cohort_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (cohort_id, %I) references public.%I (cohort_id, id) on delete %s',
      r.child, r.child || '_' || r.col || '_cohort_fkey', r.col, r.parent, r.on_del
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Navne-unikhet blir kull-lokal
-- ---------------------------------------------------------------------------
--
-- Dette er den ene endringen som faktisk fjerner en blokker: den globale
-- UNIQUE(name) på coaches, players og referees gjør at kull nr. 2 ikke kan ha
-- en spiller som heter det samme som en i G2015.

alter table public.coaches  drop constraint if exists coaches_name_key;
alter table public.players  drop constraint if exists players_name_key;
alter table public.referees drop constraint if exists referees_name_key;

alter table public.coaches  add constraint coaches_cohort_name_key  unique (cohort_id, name);
alter table public.players  add constraint players_cohort_name_key  unique (cohort_id, name);
alter table public.referees add constraint referees_cohort_name_key unique (cohort_id, name);

-- ---------------------------------------------------------------------------
-- Uttaksvei, skrevet ned så den ikke blir permanent av glemsel
-- ---------------------------------------------------------------------------

comment on table public.coaches is
  'Trener-ROSTER, ikke identitet. Raden kan finnes før invitasjonen er godtatt og skal overleve at en trener slutter — expenses.paid_by og match_coaches peker hit, og historiske utlegg må bestå. Uttaksvei: slå coaches inn i profiles off-season, når ingen aktiv sesong avhenger av id-ene.';

comment on column public.players.loan_eligible is
  'Fase 6: droppes. player_season_teams.loan_eligible blir eneste sannhet, og den tabellen låses til trenere — slik at RLS-tomhet gir riktig UI for foreldre i stedet for en kolonne-GRANT.';
