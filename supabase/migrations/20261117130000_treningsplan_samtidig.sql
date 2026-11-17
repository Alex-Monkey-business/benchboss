-- To trenere som planlegger samme dag samtidig.
--
-- Appen leser den ferske øvelseslista rett før den skriver, og legger
-- endringen oppå. Men to trykk i samme sekund leser begge før noen har
-- skrevet, og den siste vinner. Denne skriver bare hvis lista fortsatt er
-- den telefonen leste; ellers kommer ingen rad tilbake, og appen leser på
-- nytt og prøver igjen.
--
-- Bare en ny funksjon. Appen faller tilbake til vanlig skriving til den er inne.

create or replace function public.bb_endre_drills(p_id uuid, p_for jsonb, p_ny jsonb)
returns setof public.training_sessions
language sql
security invoker
as $$
  update public.training_sessions
     set drills = p_ny
   where id = p_id and drills = p_for
  returning *;
$$;

revoke all on function public.bb_endre_drills(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.bb_endre_drills(uuid, jsonb, jsonb) to authenticated;
