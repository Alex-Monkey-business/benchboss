-- Fase 3: ekte RLS på de to tabellene som bærer persondata.
--
-- Resten av basen står fortsatt på `allow_all` og venter på fase 6. Disse to
-- kan ikke vente, av to grunner:
--
--   1. De er NYE. Ingen deployet kode leser dem, så det finnes ingenting å
--      knekke — kostnaden ved å låse dem nå er null.
--   2. Rekkefølgen er endret. Trenerne blir innlogget i fase 4b, altså lenge
--      før fase 6. Med `allow_all` ville hver av dem kunne lese alle
--      medlemsrader og e-postadresser i basen med ett kall fra devtools.
--
-- Klienten skal kun se seg selv. Admin-flatene i fase 4b leser gjennom
-- member-admin-funksjonen med service_role, som ikke berøres av RLS.

drop policy if exists allow_all on public.profiles;
create policy own_profile_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists allow_all on public.cohort_members;
create policy own_membership_select on public.cohort_members
  for select to authenticated
  using (profile_id = auth.uid());

-- Kullets navn leses som embed fra medlemsraden (`cohorts(name)`), så select
-- må være åpen for de kullene man faktisk er medlem av — ikke alle.
drop policy if exists allow_all on public.cohorts;
create policy member_cohort_select on public.cohorts
  for select to authenticated
  using (exists (
    select 1 from public.cohort_members m
    where m.cohort_id = cohorts.id
      and m.profile_id = auth.uid()
      and m.status = 'active'
  ));

-- Triggerne som kobler medlemsrad og profil er SECURITY DEFINER og går
-- utenom dette med vilje: koblingen skjer før brukeren har noen rad å se.
