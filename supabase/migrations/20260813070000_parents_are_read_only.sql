-- Foreldre skal aldri skrive.
--
-- Dette er ikke fase 6. Fase 6 låser hvem som ser HVA, og krever at alle er
-- over på ekte innlogging. Dette lukker ett konkret hull som finnes akkurat nå:
--
-- `authenticated` har samme rettigheter som `anon` — DELETE, INSERT, UPDATE,
-- SELECT på alt — og policyen er `allow_all`. En invitert forelder kan altså
-- endre kampoppstillinger, slette utlegg og redigere andre lags tropper via
-- API-et. Grensesnittet skjuler det. API-et gjør ikke det.
--
-- Sperren er skrevet så den IKKE rører de to som fortsatt må virke:
--   anon (legacy-broen, der de fire trenerne skriver kampdata)  → auth.uid() er null → tillatt
--   innloggede trenere og admin                                 → ikke parent  → tillatt

create or replace function public.bb_is_parent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_members
     where profile_id = auth.uid()
       and role = 'parent'
       and status = 'active'
  )
$$;

comment on function public.bb_is_parent is
  'Er den innloggede en forelder? Usann for anon (auth.uid() er null), så legacy-broen berøres ikke. SECURITY DEFINER fordi cohort_members er låst til egne rader.';

do $$
declare t text;
begin
  foreach t in array array[
    'coaches', 'players', 'referees', 'seasons', 'cups', 'training_periods',
    'matches', 'cup_matches', 'cup_squad', 'player_season_teams', 'training_sessions',
    'expenses', 'match_players', 'match_coaches', 'match_goals', 'match_absences',
    'match_sessions', 'match_stints', 'cup_match_goals', 'training_exercises'
  ]
  loop
    execute format('drop policy if exists allow_all on public.%I', t);

    execute format(
      'create policy read_all on public.%I for select to public using (true)', t);
    execute format(
      'create policy write_unless_parent on public.%I for insert to public with check (not public.bb_is_parent())', t);
    execute format(
      'create policy update_unless_parent on public.%I for update to public using (not public.bb_is_parent()) with check (not public.bb_is_parent())', t);
    execute format(
      'create policy delete_unless_parent on public.%I for delete to public using (not public.bb_is_parent())', t);
  end loop;
end $$;
