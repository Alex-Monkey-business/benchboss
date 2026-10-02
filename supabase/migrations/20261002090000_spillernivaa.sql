-- Nivå A/B/C per spiller, for å fordele grupper når treninga differensieres.
--
-- EGEN TABELL, IKKE EN KOLONNE PÅ players. Spillertabellen er foreldre-lesbar
-- (cohort_read), og dette er det mest følsomme vi lagrer: en rangering av
-- navngitte barn. Her gjelder coach_read — foreldre får null rader, også i
-- devtools. Samme trust-klasse som match_stints.
--
-- Bare nåværende nivå, ingen historikk. Mindre barnedata, og updated_at er nok
-- til å si «sist endret for fire måneder siden» ved sesongstart.
--
-- Ingen rad = ikke satt. Å fjerne nivået er en delete, ikke en null-verdi.
create table if not exists public.player_levels (
  player_id  uuid        primary key,
  cohort_id  uuid        not null references public.cohorts(id) on delete cascade,
  level      text        not null check (level in ('A', 'B', 'C')),
  updated_at timestamptz not null default now()
);

-- Spilleren og nivået er alltid i samme kull.
alter table public.player_levels drop constraint if exists player_levels_player_id_cohort_fkey;
alter table public.player_levels
  add constraint player_levels_player_id_cohort_fkey
  foreign key (cohort_id, player_id) references public.players (cohort_id, id) on delete cascade;

create index if not exists player_levels_cohort_idx on public.player_levels (cohort_id);

-- cohort_id arves fra spilleren, som for de andre barnetabellene.
drop trigger if exists bb_set_owner on public.player_levels;
create trigger bb_set_owner
  before insert or update on public.player_levels
  for each row execute function public.bb_cohort_from_player();

create or replace function public.bb_touch_player_level()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists bb_touch on public.player_levels;
create trigger bb_touch
  before update on public.player_levels
  for each row execute function public.bb_touch_player_level();

revoke all on public.player_levels from anon;
grant select, insert, update, delete on public.player_levels to authenticated;

alter table public.player_levels enable row level security;

drop policy if exists coach_read on public.player_levels;
create policy coach_read on public.player_levels for select to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

drop policy if exists coach_insert on public.player_levels;
create policy coach_insert on public.player_levels for insert to authenticated
  with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

drop policy if exists coach_update on public.player_levels;
create policy coach_update on public.player_levels for update to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))
  with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

drop policy if exists coach_delete on public.player_levels;
create policy coach_delete on public.player_levels for delete to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

comment on table public.player_levels is
  'Nivå A/B/C per spiller (trenervurdering) for differensiert trening. Kun trenere. Ingen rad = ikke satt.';
