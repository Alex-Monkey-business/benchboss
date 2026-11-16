-- Del inn, delt mellom trenerne.
--
-- Del inn fra Hjem er det trenerne faktisk bruker på feltet (Alex, 15. nov):
-- én teller opp og deler inn, og de andre skal se det samme på sin telefon.
-- Før lå valgene bare på telefonen til den som trykket.
--
-- Én rad per kull per dag. Gruppene lagres ikke — de regnes ut av hvem som
-- er med, nivåene og valgene, likt på hver telefon (samme motor som før).
--
-- Hvem som er med:
--   - Er det trening i dag, er oppmøtet på økta (training_run_players) det
--     som gjelder. Da står spillere/trenere her som null, og statistikken
--     teller som før.
--   - Andre dager (kampoppvarming, cup) står listene her.
--   spillere = null betyr «ikke telt»: hele kullet.
--
-- Gjester (spillere fra andre lag) står alltid her, også på treningsdager:
-- de er med i fordelingen, men ikke i lagets oppmøtestatistikk.

create table if not exists public.del_inn (
  cohort_id   uuid        not null references public.cohorts(id) on delete cascade,
  dato        date        not null,
  spillere    uuid[],
  trenere     uuid[],
  -- [{ id: 'gjest-…', navn, niva: 'A'|'B'|'C'|null }]
  gjester     jsonb       not null default '[]',
  -- { form: 'grupper'|'lag', grupper: { type, antall, seed }, lag: { … } }
  valg        jsonb       not null default '{}',
  endret_av   uuid        references public.coaches(id) on delete set null,
  endret_navn text,
  endret_at   timestamptz not null default now(),
  primary key (cohort_id, dato)
);

alter table public.del_inn enable row level security;

revoke all on public.del_inn from anon;
grant select, insert, update, delete on public.del_inn to authenticated;

drop policy if exists coach_read on public.del_inn;
create policy coach_read on public.del_inn for select to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));
drop policy if exists coach_insert on public.del_inn;
create policy coach_insert on public.del_inn for insert to authenticated
  with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));
drop policy if exists coach_update on public.del_inn;
create policy coach_update on public.del_inn for update to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))
  with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));
drop policy if exists coach_delete on public.del_inn;
create policy coach_delete on public.del_inn for delete to authenticated
  using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()));

comment on table public.del_inn is
  'Dagens inndeling fra Del inn, delt mellom trenerne. Én rad per kull per dag. Gruppene regnes ut på telefonen.';
