-- FIKS-import: lag og terminliste hentet fra fotball.no.
--
-- Poenget med id-ene er ikke importen — den kunne gått uten. Poenget er at
-- vi kan hente terminlista PÅ NYTT senere og se hva som er flyttet. Uten
-- fiks_match_id er en utsatt kamp en ny kamp.

-- ---------------------------------------------------------------------------
-- Klubben
-- ---------------------------------------------------------------------------

alter table public.clubs
  add column if not exists fiks_id integer;

comment on column public.clubs.fiks_id is
  'Klubbens id på fotball.no (/fotballdata/klubb/hjem/?fiksId=). Settes én gang
   i onboardingen; kull nr. 2 i samme klubb slipper å søke.';

create unique index if not exists clubs_fiks_id_key
  on public.clubs (fiks_id) where fiks_id is not null;

-- ---------------------------------------------------------------------------
-- Laget
-- ---------------------------------------------------------------------------

alter table public.teams
  add column if not exists fiks_team_id  integer,
  add column if not exists fiks_name     text,
  add column if not exists fiks_synced_at timestamptz;

comment on column public.teams.fiks_team_id is
  'Lagets id på fotball.no. Nøkkelen terminlista hentes med.';
comment on column public.teams.fiks_name is
  'Lagets fulle navn i FIKS («Halsen G11 Grønn»). Laget heter «Grønn» i appen,
   men kampene kommer med det lange navnet — dette er koblingen mellom dem.';
comment on column public.teams.fiks_synced_at is
  'Sist gang terminlista ble sammenlignet. Brukes til å la være: én sjekk i
   døgnet per lag holder, og hjemskjermen skal ikke vente på fotball.no.';

create unique index if not exists teams_cohort_fiks_team_key
  on public.teams (cohort_id, fiks_team_id) where fiks_team_id is not null;

-- ---------------------------------------------------------------------------
-- Kampen
-- ---------------------------------------------------------------------------

alter table public.matches
  add column if not exists venue          text,
  add column if not exists fiks_match_id  bigint;

comment on column public.matches.venue is
  'Banen, slik FIKS skriver den («Bergeskogen KG 2 7er A»).';
comment on column public.matches.fiks_match_id is
  'Kampens id på fotball.no. iCal-ens UID er en NY tilfeldig GUID for hvert
   kall — verifisert 0 av 23 like mellom to hentinger — så den kan ikke brukes.
   Denne står fast.';

-- Samme kamp skal ikke kunne importeres to ganger, heller ikke om treneren
-- trykker «Hent kamper» en gang til.
create unique index if not exists matches_cohort_fiks_match_key
  on public.matches (cohort_id, fiks_match_id) where fiks_match_id is not null;

-- ---------------------------------------------------------------------------
-- Klubbens fiks-id settes av treneren, ikke av en klient med skriverett
-- ---------------------------------------------------------------------------

-- clubs har ingen insert/update-policy for klienten (bevisst — se
-- 20260825110000_rls_cohort_scope). Onboardingen trenger likevel å knytte
-- klubben til fotball.no. Én snever funksjon i stedet for en åpen policy.
create or replace function public.bb_set_club_fiks_id(
  p_club_id uuid,
  p_fiks_id integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_fiks_id is null or p_fiks_id <= 0 then
    raise exception 'Ugyldig klubb-id fra fotball.no';
  end if;

  -- Du må være admin i et kull som hører til klubben.
  if not exists (
    select 1
    from public.cohort_members m
    join public.cohorts c on c.id = m.cohort_id
    where m.profile_id = auth.uid()
      and m.status = 'active'
      and m.role = 'admin'
      and c.club_id = p_club_id
  ) and not public.bb_is_platform_admin() then
    raise exception 'Bare en admin i klubben kan koble den til fotball.no'
      using errcode = '42501';
  end if;

  -- Allerede satt til noe annet? Da har noen valgt feil klubb én gang, og
  -- det skal rettes bevisst — ikke overskrives i forbifarten.
  if exists (select 1 from public.clubs where id = p_club_id and fiks_id is not null and fiks_id <> p_fiks_id) then
    raise exception 'Klubben er allerede koblet til en annen klubb på fotball.no';
  end if;

  update public.clubs set fiks_id = p_fiks_id where id = p_club_id;
end $$;

revoke all on function public.bb_set_club_fiks_id(uuid, integer) from public;
revoke all on function public.bb_set_club_fiks_id(uuid, integer) from anon;
grant execute on function public.bb_set_club_fiks_id(uuid, integer) to authenticated;

comment on function public.bb_set_club_fiks_id is
  'Kobler en klubb til fotball.no. Kun admin i klubbens eget kull, eller plattform-admin.';
