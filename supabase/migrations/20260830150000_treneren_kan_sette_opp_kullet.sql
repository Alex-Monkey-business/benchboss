-- Treneren kan sette opp sitt eget kull — én gang
--
-- Guarden i router.js sender ALLE trenere inn i /kom-i-gang når kullet mangler
-- årgang. Men `admin_cohort_update` krever role = 'admin', og en UPDATE som RLS
-- filtrerer bort gir ingen feil — PostgREST treffer null rader og svarer «ok».
--
-- Så en trener kunne gå gjennom hele veiviseren, se «Klart.», og bli sendt rett
-- tilbake av den samme guarden ved hvert trykk på «Til Hjem». Ingen feilmelding
-- noe sted. Sten satt fast der i en time.
--
-- Retten hører til handlingen, ikke til rollen: å sette opp et kull er noe som
-- skjer ÉN gang, og bare på et kull som ikke er satt opp. Derfor en RPC med
-- `birth_year is null` som lås, ikke en utvidet policy som ville gitt hver
-- trener permanent rett til å døpe om kullet.

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

  -- Låsen. Et kull som alt har årgang er satt opp, og da er dette en vanlig
  -- endring — den hører til Admin og til admin_cohort_update.
  if v_cohort.birth_year is not null and not public.bb_is_platform_admin() then
    raise exception 'Kullet er alt satt opp. Årgangen endres i Admin.'
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

revoke all on function public.bb_cohort_setup(uuid, integer, text, integer, integer, integer) from public, anon;
grant execute on function public.bb_cohort_setup(uuid, integer, text, integer, integer, integer) to authenticated;

comment on function public.bb_cohort_setup is
  'Førstegangsoppsett av et kull fra /kom-i-gang. Enhver aktiv trener i kullet, men bare mens birth_year er null. Etterpå er kullet admins igjen.';

-- ---------------------------------------------------------------------------
-- Samme sak, ett steg tidligere: klubbkoblingen
-- ---------------------------------------------------------------------------
--
-- Steg 1 i veiviseren er «hvilken klubb?», og den skrev til clubs gjennom
-- bb_set_club_fiks_id — som også krevde admin. For en trener kastet den 42501,
-- og KomIGangView svelget feilen med en console.warn og gikk videre.
--
-- Kommentaren der sier at koblingen er «en bekvemmelighet». Det stemmer ikke:
-- uten club_fiks_id står useTerminlisteVarsel:64 av, og appen slutter å oppdage
-- at en kamp er flyttet. Sten hadde mistet den funksjonen uten å bli fortalt det.
--
-- Samme lås som over: å koble en klubb som IKKE er koblet er en del av
-- førstegangsoppsettet. Å bytte en kobling som står er noe annet, og den
-- avvises fortsatt for alle.
create or replace function public.bb_set_club_fiks_id(
  p_club_id uuid,
  p_fiks_id integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_koblet integer;
begin
  if p_fiks_id is null or p_fiks_id <= 0 then
    raise exception 'Ugyldig klubb-id fra fotball.no';
  end if;

  select fiks_id into v_koblet from public.clubs where id = p_club_id;

  -- Allerede satt til noe annet? Da har noen valgt feil klubb én gang, og
  -- det skal rettes bevisst — ikke overskrives i forbifarten.
  if v_koblet is not null and v_koblet <> p_fiks_id then
    raise exception 'Klubben er allerede koblet til en annen klubb på fotball.no';
  end if;

  -- Er klubben ukoblet, holder det å være trener i et kull som hører til den.
  -- Er den koblet, endrer denne kallet ingenting uansett.
  if not exists (
    select 1
    from public.cohort_members m
    join public.cohorts c on c.id = m.cohort_id
    where m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role in ('admin', 'coach')
      and c.club_id = p_club_id
  ) and not public.bb_is_platform_admin() then
    raise exception 'Bare en trener i klubben kan koble den til fotball.no'
      using errcode = '42501';
  end if;

  if v_koblet is null then
    update public.clubs set fiks_id = p_fiks_id where id = p_club_id;
  end if;
end $$;

revoke all on function public.bb_set_club_fiks_id(uuid, integer) from public, anon;
grant execute on function public.bb_set_club_fiks_id(uuid, integer) to authenticated;

comment on function public.bb_set_club_fiks_id is
  'Kobler en ukoblet klubb til fotball.no. Enhver aktiv trener i et av klubbens kull. En kobling som står byttes ikke herfra.';
