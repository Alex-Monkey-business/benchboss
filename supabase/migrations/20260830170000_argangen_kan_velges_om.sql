-- Årgangen kan velges om, så lenge kullet ikke er tatt i bruk
--
-- bb_cohort_setup låste på `birth_year is not null`. Det var feil lås.
--
-- Veiviseren har en tilbake-knapp fra lag-steget til årgang, og den finnes av
-- en grunn: velger man feil årgang, var lag-steget en blindvei før. Med låsen
-- ble den en blindvei igjen — bare med en feilmelding i stedet for stillhet.
-- QA-riggen fanget det på første kjøring: den prøver et tomt årstall for å se
-- tom-tilstanden, går tilbake, og velger det riktige. Andre forsøk ble nektet.
--
-- Låsen skal ikke stå på «er årgangen satt», men på «er kullet tatt i bruk».
-- Spillerne er det som gjør et kull ekte — veiviseren avslutter selv med at
-- det er dem som mangler. Så lenge det ikke finnes en eneste spiller, er vi
-- fortsatt i oppsettet, og treneren skal få ombestemme seg.
create or replace function public.bb_cohort_setup(
  p_cohort_id       uuid,
  p_birth_year      integer,
  p_gender          text,
  p_players_on_pitch integer,
  p_period_count    integer,
  p_period_minutes  integer
)
returns public.cohorts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cohort public.cohorts;
  v_klubb  text;
  v_navn   text;
  v_slug   text;
begin
  -- `null = any(...)` er null, ikke false, og en IF på null tar ingen gren. Uten
  -- den første linja ville et manglende kull-id sklidd forbi rettighetssjekken.
  if p_cohort_id is null or not (
    p_cohort_id = any(public.bb_my_coach_cohorts())
    or public.bb_is_platform_admin()
  ) then
    raise exception 'Bare en trener i kullet kan sette det opp'
      using errcode = '42501';
  end if;

  select * into v_cohort from public.cohorts where id = p_cohort_id for update;
  if not found then
    raise exception 'Kullet finnes ikke' using errcode = '42704';
  end if;

  -- Låsen. Har kullet spillere, er det i bruk, og årgangen er en vanlig
  -- endring — den hører til Admin og til admin_cohort_update.
  if exists (select 1 from public.players where cohort_id = p_cohort_id)
     and not public.bb_is_platform_admin() then
    raise exception 'Kullet er i bruk. Årgangen endres i Admin.'
      using errcode = '42501';
  end if;

  -- NFF-tabellen bor i src/lib/spillform.js og skal bli der — ett sted, ikke to
  -- som kan gli fra hverandre. Basen sjekker bare at tallene er tall som finnes.
  if p_birth_year is null
     or p_birth_year < extract(year from now())::int - 19
     or p_birth_year > extract(year from now())::int - 4 then
    raise exception 'Årgangen må være et kull mellom 4 og 19 år'
      using errcode = '22023';
  end if;
  if coalesce(p_gender, 'G') not in ('G', 'J') then
    raise exception 'Kjønnet må være G eller J' using errcode = '22023';
  end if;
  if p_players_on_pitch not in (3, 5, 7, 9, 11) then
    raise exception 'Spillformen må være 3, 5, 7, 9 eller 11' using errcode = '22023';
  end if;
  if p_period_count not between 1 and 4 or p_period_minutes not between 5 and 45 then
    raise exception 'Kamplengden er utenfor det som finnes' using errcode = '22023';
  end if;

  -- Navnet utledes her, ikke sendes inn: årgangen bestemmer det, og en trener
  -- skal ikke kunne skrive hva som helst i navnefeltet på veien forbi.
  select coalesce(nullif(trim(c.short_name), ''), split_part(c.name, ' ', 1))
    into v_klubb
    from public.clubs c
   where c.id = v_cohort.club_id;

  v_navn := nullif(trim(coalesce(v_klubb, '')), '');
  if v_navn is not null then
    v_navn := v_navn || ' ' || coalesce(p_gender, 'G') || p_birth_year::text;
    v_slug := public.bb_slugify(v_navn);

    -- Et søskenkull med samme navn i samme klubb ville brutt unique-indeksen
    -- med en feil ingen trener kan tolke. Da beholder vi navnet kullet har.
    if exists (
      select 1 from public.cohorts
       where club_id = v_cohort.club_id and slug = v_slug and id <> p_cohort_id
    ) then
      v_navn := null;
      v_slug := null;
    end if;
  end if;

  update public.cohorts
     set birth_year       = p_birth_year,
         players_on_pitch = p_players_on_pitch,
         period_count     = p_period_count,
         period_minutes   = p_period_minutes,
         name             = coalesce(v_navn, name),
         slug             = coalesce(v_slug, slug)
   where id = p_cohort_id
  returning * into v_cohort;

  return v_cohort;
end;
$$;

comment on function public.bb_cohort_setup is
  'Oppsett av et kull fra /kom-i-gang. Enhver aktiv trener i kullet, så lenge kullet ikke har spillere. Da er det i bruk, og årgangen hører til Admin.';
