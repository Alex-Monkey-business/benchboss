-- Perioden ut av modellen. STEG 2 av to — kjøres ETTER at den nye frontenden
-- er deployet.
--
-- Steg 1 (20260903090000_uka_er_kanon.sql) gjorde period_id valgfri og la
-- indeksen på (cohort_id, weekday). Etter at den kjørte kan gammel og ny
-- frontend leve side om side mot samme base. Denne filen rydder opp når bare
-- den nye er ute: den sletter månedskopiene og fjerner perioden fra modellen.
--
-- Kjøres den FØR deployen, mister gammel frontend tabellen den leser og
-- /trening tar hele siden. Rekkefølgen er ikke en formalitet.
--
-- Triggeren byttes her og ikke i steg 1: bb_cohort_from_period leser cohort_id
-- fra perioderaden og kjører på UPDATE like mye som på INSERT. Nullstiller vi
-- period_id før triggeren er byttet, setter den cohort_id til null. Økta er en
-- rot nå, ikke et barn.

drop trigger if exists bb_set_owner on public.training_sessions;
create trigger bb_set_owner
  before insert or update on public.training_sessions
  for each row execute function public.bb_cohort_root();

-- ---------------------------------------------------------------------------
-- 2. Hvilken uke overlever?
-- ---------------------------------------------------------------------------
--
-- Én uke per kull: den sist gjeldende. Nyeste periode som har startet OG har
-- økter i seg — har kullet bare planlagt fremover, tas den første fremtidige.
-- Kravet om økter er det som gjør at et kull ikke ender med tom uke fordi
-- noen opprettet en tom september ovenpå en full august.
--
-- Resten slettes. Månedskopiene var planer, ikke logg: de sa hva som var tenkt,
-- aldri hva som ble gjennomført. Det er ingen historikk å miste her.

do $$
declare
  k record;
  beholdt uuid;
begin
  for k in select distinct cohort_id from public.training_periods loop
    select p.id into beholdt
    from public.training_periods p
    where p.cohort_id = k.cohort_id
      and exists (select 1 from public.training_sessions s where s.period_id = p.id)
      and (p.start_date is null or p.start_date <= current_date)
    order by p.start_date desc nulls last, p.position desc
    limit 1;

    if beholdt is null then
      select p.id into beholdt
      from public.training_periods p
      where p.cohort_id = k.cohort_id
        and exists (select 1 from public.training_sessions s where s.period_id = p.id)
      order by p.start_date asc nulls last, p.position asc
      limit 1;
    end if;

    delete from public.training_sessions
     where cohort_id = k.cohort_id
       and (beholdt is null or period_id is distinct from beholdt);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Perioden ut av modellen
-- ---------------------------------------------------------------------------
--
-- Å droppe kolonnen tar begge fremmednøklene med seg: den enkle period_id-FK-en
-- og den sammensatte (cohort_id, period_id) fra fase 2.

alter table public.training_sessions drop column if exists period_id;

drop table if exists public.training_periods;

-- Trigger-funksjonen som leste kullet fra perioderaden har ingen tabell å lese
-- fra lenger, og ingen trigger som kaller den.
drop function if exists public.bb_cohort_from_period();

-- ---------------------------------------------------------------------------
-- 4. Ukedagen er nå hele adressen til en dag
-- ---------------------------------------------------------------------------
--
-- Indeksen på period_id peker på en kolonne som ikke finnes. Uka leses av
-- kull og sorteres på ukedag.

drop index if exists public.idx_training_sessions_period;
create index if not exists idx_training_sessions_uke
  on public.training_sessions (cohort_id, weekday);

-- Ingen unikhet på (cohort_id, weekday) med vilje. Appen hindrer to like
-- ukedager i uka, men to økter samme dag — keepertrening før felles økt — er
-- en plausibel ting å ville senere, og en constraint her ville stengt den.
