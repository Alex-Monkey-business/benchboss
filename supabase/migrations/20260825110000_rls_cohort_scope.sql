-- Fase 6: RLS-flippen. Radene du ser er kullet ditt — ikke hele basen.
--
-- Fram til nå har hver innlogget kunnet lese alt (`read_all using (true)`),
-- og bare foreldre har vært hindret fra å skrive. Det holdt så lenge det fantes
-- ett kull. Med to klubber i samme base er det det samme som å la Stag lese
-- Halsens spillerliste, dommertelefoner og utlegg.
--
-- Prinsippet:
--   - Alle innloggede i kullet leser det foreldre kan se.
--   - Trenere (admin + coach) i kullet skriver alt, og leser i tillegg det
--     foreldre IKKE skal se: dommere (telefon), utlegg, fravær, spilletid.
--   - Plattform-admin ser og gjør alt.
--   - Øvelsesbanken deles på KLUBB, ikke kull.
--
-- Hjelpefunksjonene er SECURITY DEFINER for å komme rundt at cohort_members er
-- låst til egne rader — og for å unngå rekursjon når en policy på en tabell
-- trenger å spørre cohort_members. Alle har search_path = '' og fullt
-- kvalifiserte navn.
--
-- BEFORE-triggerne som fyller cohort_id kjører FØR WITH CHECK evalueres, så
-- klienten kan fortsatt sette inn barnerader uten cohort_id.
--
-- ALDRI kjør `alter table cohort_members force row level security`: da
-- rekurserer alt.

-- ---------------------------------------------------------------------------
-- Hvem er jeg, og hvor hører jeg til?
-- ---------------------------------------------------------------------------
create or replace function public.bb_my_cohorts()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.cohort_id), '{}'::uuid[])
  from public.cohort_members m
  where m.profile_id = auth.uid() and m.status = 'active'
$$;

create or replace function public.bb_my_coach_cohorts()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.cohort_id), '{}'::uuid[])
  from public.cohort_members m
  where m.profile_id = auth.uid() and m.status = 'active' and m.role in ('admin', 'coach')
$$;

create or replace function public.bb_my_clubs()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct k.club_id), '{}'::uuid[])
  from public.cohort_members m
  join public.cohorts k on k.id = m.cohort_id
  where m.profile_id = auth.uid() and m.status = 'active'
$$;

create or replace function public.bb_my_coach_clubs()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct k.club_id), '{}'::uuid[])
  from public.cohort_members m
  join public.cohorts k on k.id = m.cohort_id
  where m.profile_id = auth.uid() and m.status = 'active' and m.role in ('admin', 'coach')
$$;

comment on function public.bb_my_cohorts is 'Kullene jeg er aktivt medlem i (alle roller). Policyene sjekker status=active — et utstedt token lever inntil en time etter revoke.';
comment on function public.bb_my_coach_cohorts is 'Kullene jeg er admin eller trener i. Skriverett, og lesing av trener-only-tabeller.';

revoke all on function public.bb_my_cohorts() from public, anon;
revoke all on function public.bb_my_coach_cohorts() from public, anon;
revoke all on function public.bb_my_clubs() from public, anon;
revoke all on function public.bb_my_coach_clubs() from public, anon;
grant execute on function public.bb_my_cohorts() to authenticated;
grant execute on function public.bb_my_coach_cohorts() to authenticated;
grant execute on function public.bb_my_clubs() to authenticated;
grant execute on function public.bb_my_coach_clubs() to authenticated;

-- ---------------------------------------------------------------------------
-- Policyene
-- ---------------------------------------------------------------------------
do $$
declare
  -- Det foreldre kan se. Merk at players fortsatt bærer loan_eligible — en
  -- kjent, skriftlig akseptert rest (se planen, fase 7).
  parent_read text[] := array[
    'coaches', 'players', 'seasons', 'cups', 'training_periods', 'training_sessions',
    'matches', 'match_players', 'match_coaches', 'match_goals',
    'cup_matches', 'cup_squad', 'cup_match_goals',
    'player_season_teams', 'teams', 'team_coaches'
  ];
  -- Kun trenere. Telefonnumre, penger, fravær, spilletid og hvem som eier hva.
  coach_only text[] := array[
    'referees', 'expenses', 'match_absences', 'match_sessions', 'match_stints',
    'coach_responsibilities', 'player_guardians'
  ];
  t text;
  old_policies text[] := array['allow_all', 'read_all', 'write_unless_parent', 'update_unless_parent', 'delete_unless_parent'];
  p text;
begin
  foreach t in array parent_read || coach_only loop
    execute format('alter table public.%I enable row level security', t);
    foreach p in array old_policies loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
    execute format('drop policy if exists cohort_read on public.%I', t);
    execute format('drop policy if exists coach_read on public.%I', t);
    execute format('drop policy if exists coach_insert on public.%I', t);
    execute format('drop policy if exists coach_update on public.%I', t);
    execute format('drop policy if exists coach_delete on public.%I', t);

    execute format(
      'create policy coach_insert on public.%I for insert to authenticated
         with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))', t);
    execute format(
      'create policy coach_update on public.%I for update to authenticated
         using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))
         with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))', t);
    execute format(
      'create policy coach_delete on public.%I for delete to authenticated
         using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))', t);
  end loop;

  foreach t in array parent_read loop
    execute format(
      'create policy cohort_read on public.%I for select to authenticated
         using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_cohorts()))', t);
  end loop;

  foreach t in array coach_only loop
    execute format(
      'create policy coach_read on public.%I for select to authenticated
         using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))', t);
  end loop;
end $$;

-- Øvelsesbanken: klubbnivå.
do $$
declare p text;
begin
  foreach p in array array['allow_all', 'read_all', 'write_unless_parent', 'update_unless_parent', 'delete_unless_parent',
                           'club_read', 'coach_insert', 'coach_update', 'coach_delete'] loop
    execute format('drop policy if exists %I on public.training_exercises', p);
  end loop;
end $$;
create policy club_read on public.training_exercises
  for select to authenticated
  using (public.bb_is_platform_admin() or club_id = any(public.bb_my_clubs()));
create policy coach_insert on public.training_exercises
  for insert to authenticated
  with check (public.bb_is_platform_admin() or club_id = any(public.bb_my_coach_clubs()));
create policy coach_update on public.training_exercises
  for update to authenticated
  using (public.bb_is_platform_admin() or club_id = any(public.bb_my_coach_clubs()))
  with check (public.bb_is_platform_admin() or club_id = any(public.bb_my_coach_clubs()));
create policy coach_delete on public.training_exercises
  for delete to authenticated
  using (public.bb_is_platform_admin() or club_id = any(public.bb_my_coach_clubs()));

-- Klubber: du ser din egen. Ingen skriver fra klienten — bb_create_cohort
-- gjør det som SECURITY DEFINER.
do $$
declare p text;
begin
  foreach p in array array['allow_all', 'read_all', 'write_unless_parent', 'update_unless_parent', 'delete_unless_parent', 'club_read'] loop
    execute format('drop policy if exists %I on public.clubs', p);
  end loop;
end $$;
create policy club_read on public.clubs
  for select to authenticated
  using (public.bb_is_platform_admin() or id = any(public.bb_my_clubs()));

-- Kull: member_cohort_select og platform_cohort_select står fra før. Admin i
-- kullet kan justere spillform og innstillinger på sitt eget kull.
drop policy if exists admin_cohort_update on public.cohorts;
create policy admin_cohort_update on public.cohorts
  for update to authenticated
  using (public.bb_is_platform_admin() or id = any(public.bb_admin_cohorts()))
  with check (public.bb_is_platform_admin() or id = any(public.bb_admin_cohorts()));

-- ---------------------------------------------------------------------------
-- Verifisering: ingen «alle leser alt» igjen, og alt med cohort_id har RLS
-- ---------------------------------------------------------------------------
do $$
declare
  leftover text;
  unguarded text;
begin
  select string_agg(tablename || '.' || policyname, ', ')
    into leftover
    from pg_policies
   where schemaname = 'public'
     and policyname in ('allow_all', 'read_all', 'write_unless_parent', 'update_unless_parent', 'delete_unless_parent');
  if leftover is not null then
    raise exception 'Gamle policyer står igjen: %', leftover;
  end if;

  select string_agg(c.relname, ', ')
    into unguarded
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'cohort_id' and not a.attisdropped
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if unguarded is not null then
    raise exception 'Tabeller med cohort_id uten RLS: %', unguarded;
  end if;
end $$;
