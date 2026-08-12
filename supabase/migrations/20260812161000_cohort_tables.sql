-- Fase 2, migrasjon 1 av 4: klubb, kull, lag og medlemskap.
--
-- Rent additivt. Ingenting i den deployede appen leser disse tabellene, og
-- `allow_all`-policyene på de 20 eksisterende tabellene røres ikke. Kullet er
-- tenant; klubb-nivået finnes for én ting — øvelsesbanken deles der.

create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.cohorts (
  id                   uuid primary key default gen_random_uuid(),
  club_id              uuid not null references public.clubs(id) on delete restrict,
  slug                 text not null,
  name                 text not null,
  birth_year           integer,
  active_season_id     uuid,
  anon_read_until      timestamptz,
  allow_coach_invites  boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (club_id, slug)
);

-- FK-en til seasons kan ikke settes her: seasons får cohort_id i migrasjon 2.
-- Den legges i migrasjon 4.
comment on column public.cohorts.active_season_id is
  'Sesongen nye kamper lander i. Alle tre sesongene i prod står status=active, så status alene kan ikke avgjøre dette — se useSeasons.js:40,53 som plukker nyeste.';
comment on column public.cohorts.anon_read_until is
  'Fase 6: selvterminerende lesevindu for anon på foreldreflatene. Null = ingen anon-tilgang. Ingen må huske å lukke det.';
comment on column public.cohorts.allow_coach_invites is
  'Av på nye kull. Alex inviterer i starten; skrus på per kull ved delegering.';

create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  full_name          text,
  is_platform_admin  boolean not null default false,
  created_at         timestamptz not null default now()
);

comment on column public.profiles.is_platform_admin is
  'Alt, på tvers av klubber. Bor her og ikke i cohort_members nettopp fordi den ikke hører til ett kull.';

-- Tilgangsraden. Med vilje denormalisert (navn, e-post, coach_id, preferanser)
-- slik at innlogging er ETT oppslag. Ingen invitations-tabell — status her er nok.
create table if not exists public.cohort_members (
  id                  uuid primary key default gen_random_uuid(),
  cohort_id           uuid not null references public.cohorts(id) on delete cascade,
  profile_id          uuid references public.profiles(id) on delete cascade,
  role                text not null check (role in ('admin', 'coach', 'parent')),
  status              text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  coach_id            uuid references public.coaches(id) on delete set null,
  name                text,
  email               text,
  preferred_team      text,
  preferred_cup_team  text,
  invited_at          timestamptz default now(),
  activated_at        timestamptz,
  created_at          timestamptz not null default now(),
  unique (cohort_id, profile_id)
);

comment on column public.cohort_members.profile_id is
  'Null inntil invitasjonen er sendt. De fem trener-radene seedes i migrasjon 3 uten auth-bruker; Edge-funksjonen i fase 4b kobler dem. Unique(cohort_id, profile_id) tåler flere null-rader.';
comment on column public.cohort_members.coach_id is
  'Peker på coaches(id), som forblir trener-identiteten (expenses.paid_by og match_coaches peker dit). ON DELETE SET NULL: trenerraden skal overleve at tilgangen fjernes.';
comment on column public.cohort_members.status is
  'Policyene i fase 6 må sjekke status=active, ikke bare at raden finnes — et utstedt access-token lever inntil en time etter revoke.';

-- En e-post skal ikke kunne inviteres to ganger til samme kull.
create unique index if not exists cohort_members_cohort_email_key
  on public.cohort_members (cohort_id, lower(email))
  where email is not null;

create index if not exists cohort_members_profile_idx on public.cohort_members (profile_id);

-- Erstatter SEASON_TEAMS i src/lib/seasonTeams.js
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references public.cohorts(id) on delete cascade,
  slug        text not null,
  name        text not null,
  accent      text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (cohort_id, slug)
);

-- Erstatter COACH_TEAMS i src/lib/coachTeams.js. Trener→lag er per SESONG:
-- lagene roterer, og historikken skal ikke skrives om når de gjør det.
create table if not exists public.team_coaches (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references public.cohorts(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  coach_id    uuid not null references public.coaches(id) on delete cascade,
  season_id   uuid not null references public.seasons(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (team_id, coach_id, season_id)
);

-- Tom med vilje. Forsikring mot en ny tenancy-runde den dagen «min sønn» skal
-- bety noe. Foreldre ser i dag hele kullet, så ingen forelder→barn-kobling
-- trengs for tilgang.
create table if not exists public.player_guardians (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references public.cohorts(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  relation    text,
  created_at  timestamptz not null default now(),
  unique (player_id, profile_id)
);

-- Samme mønster som de 20 eksisterende tabellene: RLS på med én allow_all, så
-- fase 6 blir ett sted å endre.
--
-- MEN: ingen grants til anon. Supabase' default privileges på public-skjemaet
-- gir dem ellers automatisk — og disse tabellene skal aldri kunne nås med
-- nøkkelen som ligger i JS-bundelen. Derfor eksplisitt revoke.
do $$
declare t text;
begin
  foreach t in array array['clubs', 'cohorts', 'profiles', 'cohort_members', 'teams', 'team_coaches', 'player_guardians']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists allow_all on public.%I', t);
    execute format('create policy allow_all on public.%I for all to public using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
