-- Fase 4b, DB-delen: `status` skal bety noe.
--
-- Retter en feil fra fase 3. `bb_claim_membership` flippet status til 'active'
-- i det auth-brukeren ble opprettet — altså i det invitasjonen ble SENDT, før
-- mottakeren hadde gjort noe som helst.
--
-- Det ødelegger det eneste signalet som finnes: Supabase forteller ikke at en
-- e-post bouncet. Vi får ingen feilmelding, ingen retur. Det eneste man kan
-- observere er at en invitert person aldri dukker opp. Flipper status med én
-- gang, er «kom e-posten fram?» ubesvarlig — og det er nettopp spørsmålet
-- /admin/tilgang skal svare på.
--
-- Etter denne migrasjonen:
--   invited  — raden finnes, invitasjonen er sendt, ingen har logget inn
--   active   — personen har faktisk vært inne minst én gang
--   revoked  — tilgangen er fjernet

-- Koble, men ikke aktivere.
create or replace function public.bb_claim_membership(p_profile uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_email is null then
    return 0;
  end if;

  update public.cohort_members
     set profile_id = p_profile
   where profile_id is null
     and email is not null
     and lower(email) = lower(p_email);

  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.bb_claim_membership is
  'Kobler ventende medlemsrader til en profil via e-post. Aktiverer IKKE — status flippes først ved faktisk innlogging, ellers finnes det ingen måte å se at en invitasjon aldri kom fram. Rører aldri en rad som allerede har profile_id.';

-- Samme i den andre retningen: e-post settes på en rad der profilen alt finnes.
create or replace function public.bb_link_member_on_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
begin
  if new.profile_id is not null or new.email is null then
    return new;
  end if;

  select id into v_profile
    from public.profiles
   where lower(email) = lower(new.email)
   limit 1;

  if v_profile is not null then
    new.profile_id := v_profile;
  end if;

  return new;
end $$;

-- Aktivering skjer ved første ekte innlogging, ikke før.
create or replace function public.bb_activate_on_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_sign_in_at is null or old.last_sign_in_at is not null then
    return new;
  end if;

  update public.cohort_members
     set status       = 'active',
         activated_at = coalesce(activated_at, now())
   where profile_id = new.id
     and status = 'invited';

  return new;
end $$;

comment on function public.bb_activate_on_sign_in is
  'Flipper invited → active første gang personen faktisk logger inn. En revoked rad røres ikke: å logge inn på nytt skal ikke kunne omgå at tilgangen er fjernet.';

drop trigger if exists bb_on_auth_user_sign_in on auth.users;
create trigger bb_on_auth_user_sign_in
  after update of last_sign_in_at on auth.users
  for each row execute function public.bb_activate_on_sign_in();

-- Rett opp radene som allerede fikk feil status: aktiv kun for dem som
-- faktisk har vært innlogget.
update public.cohort_members m
   set status = 'invited',
       activated_at = null
  from auth.users u
 where u.id = m.profile_id
   and m.status = 'active'
   and u.last_sign_in_at is null;

-- ---------------------------------------------------------------------------
-- Admin skal kunne se medlemmene i sitt kull
-- ---------------------------------------------------------------------------
--
-- Felle: en policy PÅ cohort_members som spør cohort_members om hvem som er
-- admin, kaller seg selv i det uendelige. Oppslaget må derfor gjøres i en
-- SECURITY DEFINER-funksjon, som går utenom RLS.
--
-- Den er STABLE og uten radargument, så planleggeren folder den til en
-- InitPlan og kjører den én gang per spørring — ikke én gang per rad.

create or replace function public.bb_admin_cohorts()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.profiles where id = auth.uid() and is_platform_admin)
      then array(select id from public.cohorts)
    else coalesce(
      array(
        select cohort_id from public.cohort_members
         where profile_id = auth.uid() and role = 'admin' and status = 'active'
      ),
      '{}'::uuid[]
    )
  end
$$;

comment on function public.bb_admin_cohorts is
  'Kullene innloggede bruker er admin i. SECURITY DEFINER for å bryte rekursjonen: en policy på cohort_members kan ikke spørre cohort_members direkte.';

drop policy if exists admin_membership_select on public.cohort_members;
create policy admin_membership_select on public.cohort_members
  for select to authenticated
  using (cohort_id = any (public.bb_admin_cohorts()));

-- Skriving går ALLTID gjennom member-admin-funksjonen med service_role.
-- Klienten skal aldri kunne sette sin egen rolle, og derfor finnes det
-- ingen insert/update-policy her i det hele tatt.

-- ---------------------------------------------------------------------------
-- Medlemsraden skal overleve at auth-brukeren forsvinner
-- ---------------------------------------------------------------------------
--
-- profile_id sto med ON DELETE CASCADE: slettes auth-brukeren, forsvinner
-- HELE medlemsraden — rolle, lag, kobling til trenerprofilen. Da er
-- tilgangshistorikken borte, og en «send invitasjonen på nytt» som må
-- rydde opp i auth-brukeren ville slettet raden den prøvde å reparere.

alter table public.cohort_members
  drop constraint if exists cohort_members_profile_id_fkey;

alter table public.cohort_members
  add constraint cohort_members_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete set null;
