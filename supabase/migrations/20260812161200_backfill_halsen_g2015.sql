-- Fase 2, migrasjon 3 av 4: backfill og seeding.
--
-- Alt som ligger i basen i dag er Halsen G2015-data. Denne migrasjonen gir det
-- en eier, og seeder lagene, trener→lag-koblingen og de fem medlemsradene.
-- Idempotent hele veien — kan kjøres to ganger uten å lage duplikater.

do $$
declare
  v_club    uuid;
  v_cohort  uuid;
  v_season  uuid;
begin
  insert into public.clubs (slug, name)
    values ('halsen-il', 'Halsen IL')
    on conflict (slug) do nothing;
  select id into v_club from public.clubs where slug = 'halsen-il';

  insert into public.cohorts (club_id, slug, name, birth_year, allow_coach_invites)
    values (v_club, 'g2015', 'Halsen G2015', 2015, false)
    on conflict (club_id, slug) do nothing;
  select id into v_cohort from public.cohorts where club_id = v_club and slug = 'g2015';

  -- Røttene først, så barna. Rekkefølgen betyr ingenting her siden alt får
  -- samme kull, men den speiler avhengighetene triggerne håndhever i
  -- migrasjon 4.
  update public.coaches           set cohort_id = v_cohort where cohort_id is null;
  update public.players           set cohort_id = v_cohort where cohort_id is null;
  update public.referees          set cohort_id = v_cohort where cohort_id is null;
  update public.seasons           set cohort_id = v_cohort where cohort_id is null;
  update public.cups              set cohort_id = v_cohort where cohort_id is null;
  update public.training_periods  set cohort_id = v_cohort where cohort_id is null;

  update public.matches             set cohort_id = v_cohort where cohort_id is null;
  update public.cup_matches         set cohort_id = v_cohort where cohort_id is null;
  update public.cup_squad           set cohort_id = v_cohort where cohort_id is null;
  update public.player_season_teams set cohort_id = v_cohort where cohort_id is null;
  update public.training_sessions   set cohort_id = v_cohort where cohort_id is null;

  update public.expenses         set cohort_id = v_cohort where cohort_id is null;
  update public.match_players    set cohort_id = v_cohort where cohort_id is null;
  update public.match_coaches    set cohort_id = v_cohort where cohort_id is null;
  update public.match_goals      set cohort_id = v_cohort where cohort_id is null;
  update public.match_absences   set cohort_id = v_cohort where cohort_id is null;
  update public.match_sessions   set cohort_id = v_cohort where cohort_id is null;
  update public.match_stints     set cohort_id = v_cohort where cohort_id is null;
  update public.cup_match_goals  set cohort_id = v_cohort where cohort_id is null;

  update public.training_exercises set club_id = v_club where club_id is null;

  -- Aktiv sesong = nyeste. Alle tre står status='active' i prod, så status
  -- alene kan ikke avgjøre det. useSeasons.js sorterer created_at desc og tar
  -- første aktive; denne raden må si nøyaktig det samme, ellers lander nye
  -- kamper i et annet kull enn appen tror.
  select id into v_season from public.seasons order by created_at desc limit 1;
  update public.cohorts set active_season_id = v_season where id = v_cohort;

  -- Lagene, fra SEASON_TEAMS i src/lib/seasonTeams.js
  insert into public.teams (cohort_id, slug, name, accent, position) values
    (v_cohort, 'gronn', 'Grønn', 'sage',  0),
    (v_cohort, 'rod',   'Rød',   'warm',  1),
    (v_cohort, 'hvit',  'Hvit',  'paper', 2)
  on conflict (cohort_id, slug) do nothing;

  -- Trener→lag for aktiv sesong, fra COACH_TEAMS i src/lib/coachTeams.js
  insert into public.team_coaches (cohort_id, team_id, coach_id, season_id)
  select v_cohort, t.id, c.id, v_season
  from (values
    ('gronn', 'Simon'),
    ('gronn', 'Alex'),
    ('rod',   'Trond'),
    ('hvit',  'Iver'),
    ('hvit',  'Jacob')
  ) as m(team_slug, coach_name)
  join public.teams   t on t.cohort_id = v_cohort and t.slug = m.team_slug
  join public.coaches c on c.name = m.coach_name and c.cohort_id = v_cohort
  on conflict (team_id, coach_id, season_id) do nothing;

  -- De fem medlemsradene. profile_id er null: ingen av trenerne har en
  -- auth-bruker ennå — den opprettes når invitasjonen sendes i fase 4b.
  --
  -- Preferansene er backfilt fra COACH_TEAMS og CUP_TEAMS, så ingen trener
  -- merker at førstenavns-oppslaget i useToday.js forsvinner. Jacob står uten
  -- cup-lag med vilje: han er ikke i CUP_TEAMS, bare i det historiske 'goat'.
  insert into public.cohort_members
    (cohort_id, profile_id, role, status, coach_id, name, preferred_team, preferred_cup_team)
  select
    v_cohort,
    null,
    case when m.coach_name = 'Alex' then 'admin' else 'coach' end,
    'invited',
    c.id,
    c.name,
    m.team_slug,
    m.cup_slug
  from (values
    ('Simon', 'gronn', 'halsen'),
    ('Alex',  'gronn', 'halsen2'),
    ('Trond', 'rod',   'halsen'),
    ('Iver',  'hvit',  'halsen2'),
    ('Jacob', 'hvit',  null)
  ) as m(coach_name, team_slug, cup_slug)
  join public.coaches c on c.name = m.coach_name and c.cohort_id = v_cohort
  where not exists (
    select 1 from public.cohort_members cm
    where cm.cohort_id = v_cohort and cm.coach_id = c.id
  );
end $$;

-- Verifiseringsport: ingen rad får stå uten eier etter dette.
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'coaches', 'players', 'referees', 'seasons', 'cups', 'training_periods',
    'matches', 'cup_matches', 'cup_squad', 'player_season_teams', 'training_sessions',
    'expenses', 'match_players', 'match_coaches', 'match_goals', 'match_absences',
    'match_sessions', 'match_stints', 'cup_match_goals'
  ]
  loop
    execute format('select count(*) from public.%I where cohort_id is null', t) into n;
    if n > 0 then
      raise exception 'Backfill feilet: % rader i % står uten cohort_id', n, t;
    end if;
  end loop;

  select count(*) into n from public.training_exercises where club_id is null;
  if n > 0 then
    raise exception 'Backfill feilet: % øvelser står uten club_id', n;
  end if;
end $$;
