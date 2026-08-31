-- Øvelsene har alltid vært klubbens. Nå sier de hvem som lagde dem.
--
-- `training_exercises` er den ENESTE tabellen som er klubb-scopet og ikke
-- kull-scopet, og det er med vilje: en øvelse er ikke aldersbestemt, og et nytt
-- kull i Halsen skal arve klubbens bank i stedet for å starte på null.
--
-- Men da må banken si hvor øvelsen kommer fra. Sytten øvelser uten avsender
-- ser ut som appens egne; «Fra G2015» forteller en ny trener at det er noen i
-- klubben som har skrevet dem, og at han kan gjøre det samme.
alter table public.training_exercises
  add column if not exists cohort_id uuid references public.cohorts(id) on delete set null;

comment on column public.training_exercises.cohort_id is
  'Kullet som lagde øvelsen. Banken deles i hele klubben (club_id er scopet) — dette er avsenderen, ikke en grense.';

-- Backfill: øvelser som fantes før denne kolonnen tilhører klubbens eldste
-- kull. Har klubben flere, gjetter vi ikke — da står de uten avsender, og
-- banken viser dem som klubbens.
update public.training_exercises te
set cohort_id = (
  select k.id from public.cohorts k
  where k.club_id = te.club_id
  order by k.created_at
  limit 1
)
where te.cohort_id is null
  and (select count(*) from public.cohorts k2 where k2.club_id = te.club_id) = 1;

-- Navnet på kullet som lagde øvelsen kan ikke leses av en trener i et ANNET
-- kull: `cohorts` er medlemsskapsstyrt, og det skal den være. Men navnet på et
-- kull i din egen klubb er ikke en hemmelighet — det står i lagnavnet på banen.
--
-- Derfor denne: kull-navnene i klubbene DU er medlem av, og ingenting mer.
create or replace function public.bb_club_cohort_names()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path to ''
as $$
  select k.id, k.name
  from public.cohorts k
  where k.club_id = any (public.bb_my_clubs())
$$;

grant execute on function public.bb_club_cohort_names() to authenticated;
