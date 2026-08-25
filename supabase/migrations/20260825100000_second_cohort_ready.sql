-- Kull nr. 2: alt basen trenger for at en annen klubb kan finnes ved siden av
-- Halsen G2015 uten at noe av det knekker.
--
-- Bakgrunnen er konkret: en trener i en annen klubb vil sette opp sitt eget
-- kull. I dag ville selve raden i `cohorts` gjort at «ny spiller» og «ny
-- sesong» feilet for Halsen (bb_cohort_root nekter når det finnes to kull og
-- klienten ikke sier hvilket), lagnavnene er CHECK-constraints med Halsens
-- farger, og «hvem er vi» i kampene er strengen 'halsen'.
--
-- Rent additivt bortsett fra fire CHECK-constraints som erstattes av noe
-- strengere: en sammensatt FK mot kullets egne lag.

-- ---------------------------------------------------------------------------
-- 1. Klubben trenger et kortnavn — det er DET som står i kampoppsettet
-- ---------------------------------------------------------------------------
-- Kretsens serieoppsett skriver «Halsen Grønn», ikke «Halsen IL Grønn». Appen
-- finner sine egne kamper ved å lete etter kortnavnet i lagstrengen, og det
-- kan ikke utledes trygt fra fullt navn for enhver klubb («Stag» vs «Stag IF»
-- går, «FK Tønsberg» gjør det ikke). Derfor egen kolonne, satt av mennesket.
alter table public.clubs add column if not exists short_name text;
update public.clubs set short_name = split_part(name, ' ', 1) where short_name is null;
alter table public.clubs alter column short_name set not null;

comment on column public.clubs.short_name is
  'Slik klubben skrives i kretsens kampoppsett («Halsen», «Stag»). Appen avgjør «vår kamp» ved å lete etter dette i home_team/away_team — case-insensitivt.';

-- ---------------------------------------------------------------------------
-- 2. Spillform per kull
-- ---------------------------------------------------------------------------
-- 7er og 2×30 sto hardkodet i kampmodus. G8 spiller 5er.
alter table public.cohorts
  add column if not exists players_on_pitch integer not null default 7,
  add column if not exists period_count integer not null default 2,
  add column if not exists period_minutes integer not null default 30;

alter table public.cohorts drop constraint if exists cohorts_players_on_pitch_check;
alter table public.cohorts add constraint cohorts_players_on_pitch_check
  check (players_on_pitch in (3, 5, 7, 9, 11));
alter table public.cohorts drop constraint if exists cohorts_period_count_check;
alter table public.cohorts add constraint cohorts_period_count_check
  check (period_count between 1 and 4);
alter table public.cohorts drop constraint if exists cohorts_period_minutes_check;
alter table public.cohorts add constraint cohorts_period_minutes_check
  check (period_minutes between 5 and 45);

comment on column public.cohorts.players_on_pitch is
  'Spillform: 3/5/7/9/11. Styrer formasjonen i kampmodus.';

-- Kampmodus har lest period_count/period_minutes fra match_sessions siden
-- juni, men kolonnene ble aldri lagt til i prod (supabase-migration-
-- match-period-config.sql ble ikke kjørt). Appen falt stille tilbake til 2×30.
alter table public.match_sessions
  add column if not exists period_count integer,
  add column if not exists period_minutes integer;

-- ---------------------------------------------------------------------------
-- 3. Trenerbilder er data, ikke et navnekart i koden
-- ---------------------------------------------------------------------------
-- COACH_IMAGES i useCoaches.js koblet «Simon» → simon.png for ALLE kull. En
-- Simon i en annen klubb ville fått Halsen-Simons ansikt.
alter table public.coaches add column if not exists photo_url text;

update public.coaches c
   set photo_url = '/coaches/' || lower(c.name) || '.png'
  from public.cohorts k
 where k.id = c.cohort_id
   and k.slug = 'g2015'
   and c.name in ('Trond', 'Iver', 'Simon', 'Jacob')
   and c.photo_url is null;

-- ---------------------------------------------------------------------------
-- 4. Lag er kullets rader, ikke en global liste
-- ---------------------------------------------------------------------------
-- players.primary_team og player_season_teams.team var CHECK (gronn/rod/hvit).
-- Nå peker de på teams(cohort_id, slug): et lag må finnes i SAMME kull. Det er
-- strengere enn før — en Halsen-spiller kan ikke settes på et Stag-lag — og
-- det åpner for alle navn.
--
-- ON DELETE RESTRICT med vilje: sletter man et lag med spillere på, skal det
-- si stopp. Spillerne flyttes først.
alter table public.players drop constraint if exists players_primary_team_check;
alter table public.players drop constraint if exists players_primary_team_fkey;
alter table public.players
  add constraint players_primary_team_fkey
  foreign key (cohort_id, primary_team) references public.teams (cohort_id, slug)
  on update cascade on delete restrict;

alter table public.player_season_teams drop constraint if exists player_season_teams_team_check;
alter table public.player_season_teams drop constraint if exists player_season_teams_team_fkey;
alter table public.player_season_teams
  add constraint player_season_teams_team_fkey
  foreign key (cohort_id, team) references public.teams (cohort_id, slug)
  on update cascade on delete restrict;

-- Cup-lagene er et parallelt navnerom med slugs per cup (se lib/cupTeams.js).
-- CHECK-en listet fire Halsen-slugs og ville nektet enhver annen klubb en cup.
alter table public.cup_matches drop constraint if exists cup_matches_our_team_check;
alter table public.cup_squad drop constraint if exists cup_squad_cup_team_check;

-- ---------------------------------------------------------------------------
-- 5. Plattform-admin
-- ---------------------------------------------------------------------------
create or replace function public.bb_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

comment on function public.bb_is_platform_admin is
  'Alt, på tvers av klubber. SECURITY DEFINER fordi profiles er låst til egen rad.';

-- Plattform-admin må se alle kull for å kunne opprette og administrere dem.
drop policy if exists platform_cohort_select on public.cohorts;
create policy platform_cohort_select on public.cohorts
  for select to authenticated using (public.bb_is_platform_admin());

drop policy if exists platform_membership_select on public.cohort_members;
create policy platform_membership_select on public.cohort_members
  for select to authenticated using (public.bb_is_platform_admin());

-- ---------------------------------------------------------------------------
-- 6. Opprett kull — én transaksjon, kun plattform-admin
-- ---------------------------------------------------------------------------
create or replace function public.bb_slugify(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(coalesce(p, '')), 'æøåéèüö', 'aoaeeuo'),
    '[^a-z0-9]+', '-', 'g'
  ))
$$;

-- Klubb (ny eller eksisterende) → kull → lag → sesong → den som oppretter
-- blir admin med egen trenerrad. Alt eller ingenting.
--
-- p_teams: [{ "name": "Stag 1", "slug": "stag-1", "accent": "sage" }, ...]
-- slug og accent er valgfrie.
create or replace function public.bb_create_cohort(
  p_club_id          uuid,
  p_club_name        text,
  p_club_short_name  text,
  p_name             text,
  p_slug             text,
  p_birth_year       integer,
  p_players_on_pitch integer,
  p_period_count     integer,
  p_period_minutes   integer,
  p_teams            jsonb,
  p_season_name      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club     uuid;
  v_cohort   uuid;
  v_season   uuid;
  v_coach    uuid;
  v_profile  public.profiles%rowtype;
  v_name     text;
  v_slug     text;
  v_team     jsonb;
  v_pos      integer := 0;
begin
  if not public.bb_is_platform_admin() then
    raise exception 'Kun plattform-admin kan opprette kull' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Kullet må ha et navn';
  end if;

  if p_club_id is null then
    if coalesce(trim(p_club_name), '') = '' then
      raise exception 'Klubben må ha et navn';
    end if;
    insert into public.clubs (slug, name, short_name)
    values (
      public.bb_slugify(p_club_name),
      trim(p_club_name),
      coalesce(nullif(trim(p_club_short_name), ''), split_part(trim(p_club_name), ' ', 1))
    )
    returning id into v_club;
  else
    v_club := p_club_id;
    if not exists (select 1 from public.clubs where id = v_club) then
      raise exception 'Fant ikke klubben';
    end if;
  end if;

  insert into public.cohorts (club_id, slug, name, birth_year, players_on_pitch, period_count, period_minutes)
  values (
    v_club,
    coalesce(nullif(trim(p_slug), ''), public.bb_slugify(p_name)),
    trim(p_name),
    p_birth_year,
    coalesce(p_players_on_pitch, 7),
    coalesce(p_period_count, 2),
    coalesce(p_period_minutes, 30)
  )
  returning id into v_cohort;

  for v_team in select * from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) loop
    if coalesce(trim(v_team->>'name'), '') = '' then continue; end if;
    v_slug := coalesce(nullif(trim(v_team->>'slug'), ''), public.bb_slugify(v_team->>'name'));
    insert into public.teams (cohort_id, slug, name, accent, position)
    values (v_cohort, v_slug, trim(v_team->>'name'), nullif(v_team->>'accent', ''), v_pos);
    v_pos := v_pos + 1;
  end loop;

  if coalesce(trim(p_season_name), '') <> '' then
    insert into public.seasons (cohort_id, name, status)
    values (v_cohort, trim(p_season_name), 'active')
    returning id into v_season;
    update public.cohorts set active_season_id = v_season where id = v_cohort;
  end if;

  -- Den som oppretter kullet skal kunne gå rett inn i det. Trenerraden er
  -- identiteten resten av appen bruker (match_coaches, expenses.paid_by).
  select * into v_profile from public.profiles where id = auth.uid();
  -- Navnet: profilen, ellers det man heter i et kull man alt er medlem av,
  -- ellers e-postens lokaldel. «alexander.samnoy» er et dårlig trenernavn.
  v_name := coalesce(
    nullif(trim(v_profile.full_name), ''),
    (select m.name from public.cohort_members m
      where m.profile_id = auth.uid() and nullif(trim(m.name), '') is not null
      order by m.created_at limit 1),
    nullif(split_part(coalesce(v_profile.email, ''), '@', 1), ''),
    'Admin'
  );

  insert into public.coaches (cohort_id, name) values (v_cohort, v_name) returning id into v_coach;

  insert into public.cohort_members (cohort_id, profile_id, role, status, coach_id, name, email, activated_at)
  values (v_cohort, auth.uid(), 'admin', 'active', v_coach, v_name, v_profile.email, now());

  return v_cohort;
end $$;

revoke all on function public.bb_create_cohort(uuid, text, text, text, text, integer, integer, integer, integer, jsonb, text) from public;
revoke all on function public.bb_create_cohort(uuid, text, text, text, text, integer, integer, integer, integer, jsonb, text) from anon;
grant execute on function public.bb_create_cohort(uuid, text, text, text, text, integer, integer, integer, integer, jsonb, text) to authenticated;

comment on function public.bb_create_cohort is
  'Veiviseren bak /admin/plattform. Kun plattform-admin. Oppretter klubb (om ny), kull, lag, sesong og gir kalleren admin-medlemskap — i én transaksjon.';

-- ---------------------------------------------------------------------------
-- Verifisering
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.clubs where short_name is null) then
    raise exception 'clubs.short_name mangler på en rad';
  end if;
  if exists (
    select 1 from pg_constraint
    where conname in ('players_primary_team_check', 'player_season_teams_team_check',
                      'cup_matches_our_team_check', 'cup_squad_cup_team_check')
  ) then
    raise exception 'En gammel lag-CHECK står fortsatt';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'players_primary_team_fkey') then
    raise exception 'players_primary_team_fkey mangler';
  end if;
end $$;
