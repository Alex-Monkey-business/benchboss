-- Rollback for 20260825110000_rls_cohort_scope.sql: tilbake til read_all + *_unless_parent.
do $$
declare t text; p text;
begin
  foreach t in array array[
    'coaches','players','referees','seasons','cups','training_periods','matches','cup_matches','cup_squad',
    'player_season_teams','training_sessions','expenses','match_players','match_coaches','match_goals',
    'match_absences','match_sessions','match_stints','cup_match_goals','training_exercises','coach_responsibilities',
    'clubs','teams','team_coaches','player_guardians'
  ] loop
    foreach p in array array['cohort_read','coach_read','club_read','coach_insert','coach_update','coach_delete'] loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
    execute format('create policy read_all on public.%I for select to authenticated using (true)', t);
    execute format('create policy write_unless_parent on public.%I for insert to authenticated with check (not public.bb_is_parent())', t);
    execute format('create policy update_unless_parent on public.%I for update to authenticated using (not public.bb_is_parent()) with check (not public.bb_is_parent())', t);
    execute format('create policy delete_unless_parent on public.%I for delete to authenticated using (not public.bb_is_parent())', t);
  end loop;
end $$;
drop policy if exists admin_cohort_update on public.cohorts;
