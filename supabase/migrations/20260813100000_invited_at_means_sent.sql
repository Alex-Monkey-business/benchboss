-- `invited_at` skal bety «en invitasjon ble faktisk sendt».
--
-- Den hadde `default now()`, så den ble satt i det raden ble opprettet — også
-- for de fem trener-radene som ble seedet i fase 2 uten e-post. Kolonnen sa
-- altså «invitert i dag» om noe som aldri var sendt, og skjermen måtte lyve
-- seg rundt det ved å sjekke om e-post manglet.
--
-- Nå trengs skillet for noe ekte: en e-post kan lagres uten at invitasjonen
-- sendes, og da skal raden vise «Ikke invitert ennå» — ikke «Invitert».

alter table public.cohort_members alter column invited_at drop default;

update public.cohort_members
   set invited_at = null
 where email is null;
