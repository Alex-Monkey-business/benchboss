-- Lag per sesong (Alex, 21. nov 2026).
--
-- Neste sesong meldes lagene på etter nivå: A-, B- og C-serien. Fargene
-- (Grønn, Rød, Hvit) er bare navnene kretsen gir lagene, og de kommer først
-- når påmeldingen er klar. Fjorårets lag og historikk skal stå urørt.
--
-- Modellen: et lag gjelder FRA OG MED en sesong, til en senere sesong får egne
-- lag. `from_season_id` null = fra starten (alle lag som fantes før dette).
-- Appen slår opp lagene for en sesong som den siste generasjonen som startet
-- i eller før sesongen. Slug er fortsatt unik per kull, så FK-ene fra
-- players.primary_team og player_season_teams.team står som før.
--
-- Bare utvidelse: appen som kjører nå leser kolonnen ikke og merker ingenting.

alter table public.teams
  add column if not exists from_season_id uuid references public.seasons(id) on delete cascade;

comment on column public.teams.from_season_id is
  'Sesongen laget gjelder fra. Null = fra starten. Laget gjelder til en senere sesong får egne lag.';

-- Samme FIKS-lag kan meldes på år etter år («Halsen G12 Grønn» kan bli B-laget
-- neste år). Unikt per generasjon, ikke per kull, ellers krasjer koblingen.
drop index if exists public.teams_cohort_fiks_team_key;
create unique index if not exists teams_cohort_season_fiks_team_key
  on public.teams (cohort_id, coalesce(from_season_id, '00000000-0000-0000-0000-000000000000'::uuid), fiks_team_id)
  where fiks_team_id is not null;

-- ---------------------------------------------------------------------------
-- Nye lag for en sesong, i én transaksjon
-- ---------------------------------------------------------------------------
-- 1. Fryser historikken: hver spiller får en player_season_teams-rad for alle
--    tidligere sesonger, med laget de har nå. Uten raden faller appen tilbake
--    på players.primary_team, og fjoråret ville vist det nye laget.
-- 2. Tømmer players.primary_team. Ingen er på et nytt lag før treneren sier
--    det (eller trykker «Fordel etter nivå»).
-- 3. Lager lagene.
create or replace function public.bb_nye_lag(p_season_id uuid, p_names text[])
returns setof public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.seasons;
  v_name   text;
  v_slug   text;
  v_base   text;
  v_n      integer;
  v_pos    integer := 0;
begin
  select * into v_season from public.seasons where id = p_season_id;
  if not found then
    raise exception 'Sesongen finnes ikke' using errcode = '42704';
  end if;

  if not (
    v_season.cohort_id = any(public.bb_my_coach_cohorts())
    or public.bb_is_platform_admin()
  ) then
    raise exception 'Bare en trener i kullet kan sette opp lag' using errcode = '42501';
  end if;

  if p_names is null or coalesce(array_length(p_names, 1), 0) = 0 then
    raise exception 'Minst ett lag' using errcode = '22023';
  end if;

  if exists (select 1 from public.teams where from_season_id = p_season_id) then
    raise exception 'Sesongen har allerede egne lag' using errcode = '23505';
  end if;

  -- Spilte kamper hører til lagene som spilte dem. Da er det en ny sesong
  -- som trengs, ikke nye lag i denne.
  if exists (
    select 1 from public.matches
     where season_id = p_season_id and home_score is not null
  ) then
    raise exception 'Sesongen har spilte kamper. Opprett en ny sesong først.'
      using errcode = '22023';
  end if;

  -- 1. Historikken.
  update public.player_season_teams pst
     set team = p.primary_team
    from public.players p, public.seasons s
   where pst.player_id = p.id
     and pst.season_id = s.id
     and s.cohort_id = v_season.cohort_id
     and s.created_at < v_season.created_at
     and pst.team is null
     and p.primary_team is not null;

  insert into public.player_season_teams (player_id, season_id, team, loan_eligible)
  select p.id, s.id, p.primary_team, false
    from public.players p
    join public.seasons s on s.cohort_id = p.cohort_id
   where p.cohort_id = v_season.cohort_id
     and p.primary_team is not null
     and s.created_at < v_season.created_at
  on conflict (player_id, season_id) do nothing;

  -- 2. Ingen er på et nytt lag ennå.
  update public.players
     set primary_team = null
   where cohort_id = v_season.cohort_id
     and primary_team is not null;

  -- 3. Lagene. Slug unik per kull: «A» i en senere sesong blir «a-2».
  foreach v_name in array p_names loop
    v_name := trim(v_name);
    continue when v_name = '';
    v_base := coalesce(nullif(public.bb_slugify(v_name), ''), 'lag');
    v_slug := v_base;
    v_n := 2;
    while exists (select 1 from public.teams where cohort_id = v_season.cohort_id and slug = v_slug) loop
      v_slug := v_base || '-' || v_n;
      v_n := v_n + 1;
    end loop;

    return query
      insert into public.teams (cohort_id, slug, name, accent, position, from_season_id)
      values (v_season.cohort_id, v_slug, v_name, null, v_pos, p_season_id)
      returning *;
    v_pos := v_pos + 1;
  end loop;
end;
$$;

comment on function public.bb_nye_lag is
  'Nye lag fra og med en sesong. Fryser spillernes lag i tidligere sesonger, tømmer primary_team og lager lagene. Bare trenere i kullet.';

revoke all on function public.bb_nye_lag(uuid, text[]) from public, anon;
grant execute on function public.bb_nye_lag(uuid, text[]) to authenticated;
