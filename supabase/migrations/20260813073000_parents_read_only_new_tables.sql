-- Etterslep fra forrige migrasjon: de fire tabellene fra fase 2 sto fortsatt
-- på allow_all. De har ingen anon-tilgang, men `authenticated` har skriverett
-- — så en forelder kunne endre lag og trener-til-lag-koblinger. Samme sperre.
do $$
declare t text;
begin
  foreach t in array array['clubs', 'teams', 'team_coaches', 'player_guardians']
  loop
    execute format('drop policy if exists allow_all on public.%I', t);
    execute format('create policy read_all on public.%I for select to authenticated using (true)', t);
    execute format('create policy write_unless_parent on public.%I for insert to authenticated with check (not public.bb_is_parent())', t);
    execute format('create policy update_unless_parent on public.%I for update to authenticated using (not public.bb_is_parent()) with check (not public.bb_is_parent())', t);
    execute format('create policy delete_unless_parent on public.%I for delete to authenticated using (not public.bb_is_parent())', t);
  end loop;
end $$;
