-- Hvor mange som er på trening i dag — ett tall, delt mellom trenerne.
--
-- Trenerne er alt fra 15 til 28, og knoter med oppdelingen hver gang. Når
-- antallet er kjent, er planen for hele økta kjent: hvor mange grupper på
-- hver øvelse og hvor mange i hver. Én trener setter tallet på feltet, og det
-- står på telefonen til de andre også.
--
-- BARE ET TALL. Hvem som mangler blir liggende på telefonen til den som
-- trykket dem bort — det er ikke et oppmøteregister, og vi vil ikke ha ett.
--
-- Nøkkelen er treningsdagen (malen i uka) + datoen. Uka gjentar seg, så
-- tirsdag 8. okt og tirsdag 15. okt er samme rad i training_sessions, men to
-- forskjellige treninger.
create table if not exists public.training_counts (
  session_id uuid        not null references public.training_sessions(id) on delete cascade,
  dato       date        not null,
  antall     integer     not null check (antall between 1 and 60),
  cohort_id  uuid        not null references public.cohorts(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (session_id, dato)
);

create index if not exists training_counts_cohort_idx on public.training_counts (cohort_id, dato);

-- cohort_id arves fra treningsdagen.
create or replace function public.bb_cohort_from_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cohort_id into new.cohort_id from public.training_sessions where id = new.session_id;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists bb_set_owner on public.training_counts;
create trigger bb_set_owner
  before insert or update on public.training_counts
  for each row execute function public.bb_cohort_from_session();

revoke all on public.training_counts from anon;
grant select, insert, update, delete on public.training_counts to authenticated;

alter table public.training_counts enable row level security;

-- Trenerne leser og skriver. Foreldre trenger ikke tallet: det de ser av
-- treninga, er øvelsene.
drop policy if exists coach_read on public.training_counts;
create policy coach_read on public.training_counts for select to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

drop policy if exists coach_insert on public.training_counts;
create policy coach_insert on public.training_counts for insert to authenticated
  with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

drop policy if exists coach_update on public.training_counts;
create policy coach_update on public.training_counts for update to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))
  with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

drop policy if exists coach_delete on public.training_counts;
create policy coach_delete on public.training_counts for delete to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

comment on table public.training_counts is
  'Antall spillere på en trening (dag + dato), delt mellom trenerne. Bare tallet — ikke hvem.';
