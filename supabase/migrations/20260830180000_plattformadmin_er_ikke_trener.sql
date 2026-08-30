-- Plattform-admin er ikke trener i kullene han oppretter
--
-- bb_create_cohort lagde en coaches-rad for den som opprettet kullet. Sammen
-- med veiviserens selvkobling gjorde det at Alex sto som trener på hver kamp i
-- lag han aldri har sett — og selv uten den sto han i trenerlista, i
-- ansvarsfordelingen og i dommerutlegget hos alle.
--
-- Han oppretter kull for ANDRE. Medlemskapet gir ham tilgang; trenerrollen er
-- noe man får, ikke noe som følger med.
--
-- Funksjonen er ellers uendret fra 20260825100000 — bare trenerraden er borte
-- og coach_id på medlemskapet er null.

create or replace function public.bb_create_cohort(
  p_club_id          uuid,
  p_club_name        text,
  p_club_short_name  text,
  p_name             text,
  p_slug             text,
  p_birth_year       integer,
  p_players_on_pitch integer,
  p_period_count     integer,
  p_period_minutes   integer,
  p_teams            jsonb,
  p_season_name      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club     uuid;
  v_cohort   uuid;
  v_season   uuid;
  v_profile  public.profiles%rowtype;
  v_name     text;
  v_slug     text;
  v_team     jsonb;
  v_pos      integer := 0;
begin
  if not public.bb_is_platform_admin() then
    raise exception 'Kun plattform-admin kan opprette kull' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Kullet må ha et navn';
  end if;

  if p_club_id is null then
    if coalesce(trim(p_club_name), '') = '' then
      raise exception 'Klubben må ha et navn';
    end if;
    insert into public.clubs (slug, name, short_name)
    values (
      public.bb_slugify(p_club_name),
      trim(p_club_name),
      coalesce(nullif(trim(p_club_short_name), ''), split_part(trim(p_club_name), ' ', 1))
    )
    returning id into v_club;
  else
    v_club := p_club_id;
    if not exists (select 1 from public.clubs where id = v_club) then
      raise exception 'Fant ikke klubben';
    end if;
  end if;

  insert into public.cohorts (club_id, slug, name, birth_year, players_on_pitch, period_count, period_minutes)
  values (
    v_club,
    coalesce(nullif(trim(p_slug), ''), public.bb_slugify(p_name)),
    trim(p_name),
    p_birth_year,
    coalesce(p_players_on_pitch, 7),
    coalesce(p_period_count, 2),
    coalesce(p_period_minutes, 30)
  )
  returning id into v_cohort;

  for v_team in select * from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) loop
    if coalesce(trim(v_team->>'name'), '') = '' then continue; end if;
    v_slug := coalesce(nullif(trim(v_team->>'slug'), ''), public.bb_slugify(v_team->>'name'));
    insert into public.teams (cohort_id, slug, name, accent, position)
    values (v_cohort, v_slug, trim(v_team->>'name'), nullif(v_team->>'accent', ''), v_pos);
    v_pos := v_pos + 1;
  end loop;

  if coalesce(trim(p_season_name), '') <> '' then
    insert into public.seasons (cohort_id, name, status)
    values (v_cohort, trim(p_season_name), 'active')
    returning id into v_season;
    update public.cohorts set active_season_id = v_season where id = v_cohort;
  end if;

  -- Den som oppretter kullet skal kunne gå rett inn i det.
  select * into v_profile from public.profiles where id = auth.uid();
  -- Navnet: profilen, ellers det man heter i et kull man alt er medlem av,
  -- ellers e-postens lokaldel. «alexander.samnoy» er et dårlig trenernavn.
  v_name := coalesce(
    nullif(trim(v_profile.full_name), ''),
    (select m.name from public.cohort_members m
      where m.profile_id = auth.uid() and nullif(trim(m.name), '') is not null
      order by m.created_at limit 1),
    nullif(split_part(coalesce(v_profile.email, ''), '@', 1), ''),
    'Admin'
  );

  -- INGEN trenerrad. Den lagde vi før, og da sto plattform-admin i trenerlista,
  -- i ansvarsfordelingen og i dommerutlegget i hvert eneste kull han opprettet
  -- for andre. Alex sa det selv: han skal ikke synes over hodet på andre lag.
  --
  -- Skulle han faktisk trene et av dem, lager member-admin trenerraden når han
  -- inviteres i Tilgang (se ensureCoach — et medlem uten coach_id får en da).
  -- Retten til å bli trener er der; den bare inntreffer ikke av seg selv.
  insert into public.cohort_members (cohort_id, profile_id, role, status, coach_id, name, email, activated_at)
  values (v_cohort, auth.uid(), 'admin', 'active', null, v_name, v_profile.email, now());

  return v_cohort;
end $$;

comment on function public.bb_create_cohort is
  'Veiviseren bak /admin/plattform. Kun plattform-admin. Oppretter klubb (om ny), kull, lag, sesong og gir kalleren admin-medlemskap UTEN trenerrad — i én transaksjon.';
