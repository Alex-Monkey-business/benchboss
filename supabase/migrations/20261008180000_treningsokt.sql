-- «Start økta»: hvem som er på trening, delt live mellom trenerne, og
-- historikken etterpå — oppmøtestatistikk som for kampene.
--
-- En økt er treningsdagen (malen i uka) på en dato. Uka gjentar seg, så
-- tirsdag 8. okt og tirsdag 15. okt er samme training_sessions-rad, men to
-- økter.
--
-- Oppmøtet ER et register, og det er et valg (Alex, 8. okt): trenerne vil se
-- hvem som har vært der. Det er trener-only, som nivåene — foreldre får null
-- rader.
--
-- Gruppene lagres IKKE. De regnes ut av oppmøtet, nivåene og øvelsen, likt på
-- hver telefon. Det som lagres er trenernes inngrep: per øvelse frøet
-- («bland»), et overstyrt antall grupper og byttene — i state.
--
-- training_counts («Vi er 21») erstattes: antallet er nå oppmøtet.

create table if not exists public.training_runs (
  id          uuid        primary key default gen_random_uuid(),
  -- Slettes treningsdagen, skal statistikken stå. Tittelen er kopiert av
  -- samme grunn.
  session_id  uuid        references public.training_sessions(id) on delete set null,
  title       text,
  dato        date        not null,
  cohort_id   uuid        not null references public.cohorts(id) on delete cascade,
  -- Sesongen som var aktiv da økta startet — statistikken følger sesongvelgeren.
  season_id   uuid        references public.seasons(id) on delete set null,
  started_at  timestamptz not null default now(),
  state       jsonb       not null default '{}',
  unique (session_id, dato)
);

create index if not exists training_runs_cohort_idx on public.training_runs (cohort_id, dato);

create table if not exists public.training_run_players (
  run_id    uuid not null references public.training_runs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  primary key (run_id, player_id)
);

create table if not exists public.training_run_coaches (
  run_id    uuid not null references public.training_runs(id) on delete cascade,
  coach_id  uuid not null references public.coaches(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  primary key (run_id, coach_id)
);

create index if not exists training_run_players_player_idx on public.training_run_players (player_id);

-- Kull, tittel og sesong arves fra treningsdagen.
create or replace function public.bb_run_from_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select s.cohort_id, coalesce(new.title, s.title) into new.cohort_id, new.title
      from public.training_sessions s where s.id = new.session_id;
    if new.season_id is null then
      select id into new.season_id from public.seasons
        where cohort_id = new.cohort_id and status = 'active'
        order by created_at desc limit 1;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists bb_set_owner on public.training_runs;
create trigger bb_set_owner
  before insert on public.training_runs
  for each row execute function public.bb_run_from_session();

create or replace function public.bb_cohort_from_run()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select cohort_id into new.cohort_id from public.training_runs where id = new.run_id;
  return new;
end $$;

drop trigger if exists bb_set_owner on public.training_run_players;
create trigger bb_set_owner
  before insert or update on public.training_run_players
  for each row execute function public.bb_cohort_from_run();

drop trigger if exists bb_set_owner on public.training_run_coaches;
create trigger bb_set_owner
  before insert or update on public.training_run_coaches
  for each row execute function public.bb_cohort_from_run();

-- Én øvelses inngrep, flettet inn uten å skrive over de andre øvelsene.
-- Tre trenere som bytter navn på hver sin øvelse samtidig skal ikke slette
-- hverandres bytter. Security invoker: RLS gjelder.
create or replace function public.bb_run_set_state(p_run uuid, p_key text, p_value jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  update public.training_runs
     set state = case when p_value is null then state - p_key
                      else jsonb_set(state, array[p_key], p_value, true) end
   where id = p_run
  returning state;
$$;

revoke all on public.training_runs, public.training_run_players, public.training_run_coaches from anon;
grant select, insert, update, delete on public.training_runs, public.training_run_players, public.training_run_coaches to authenticated;
revoke all on function public.bb_run_set_state(uuid, text, jsonb) from anon, public;
grant execute on function public.bb_run_set_state(uuid, text, jsonb) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['training_runs', 'training_run_players', 'training_run_coaches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists coach_read on public.%I', t);
    execute format('create policy coach_read on public.%I for select to authenticated using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))', t);
    execute format('drop policy if exists coach_insert on public.%I', t);
    execute format('create policy coach_insert on public.%I for insert to authenticated with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))', t);
    execute format('drop policy if exists coach_update on public.%I', t);
    execute format('create policy coach_update on public.%I for update to authenticated using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts())) with check (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))', t);
    execute format('drop policy if exists coach_delete on public.%I', t);
    execute format('create policy coach_delete on public.%I for delete to authenticated using (public.bb_is_platform_admin() or cohort_id = any(public.bb_my_coach_cohorts()))', t);
  end loop;
end $$;

comment on table public.training_runs is
  'En gjennomført trening (dag + dato). Oppmøtet henger på den. state = trenernes inngrep i gruppene per øvelse.';
comment on table public.training_run_players is
  'Spillere som var på treninga. Trener-only. Grunnlaget for oppmøtestatistikken.';
comment on table public.training_run_coaches is
  'Trenere som var på treninga. Grunnlaget for trenerfordelingen på gruppene.';

-- «Vi er 21» levde én kveld. Antallet er nå oppmøtet.
drop table if exists public.training_counts;
drop function if exists public.bb_cohort_from_session();
