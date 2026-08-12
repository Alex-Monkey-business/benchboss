-- Fase 3, DB-delen: profil ved innlogging, og kobling av medlemsraden.
--
-- Medlemsraden finnes FØR brukeren. Det er hele invitasjonsmodellen: admin
-- oppretter raden med e-post og rolle, og først når personen faktisk logger
-- inn finnes det en auth-bruker å koble den til.
--
-- Koblingen må derfor virke fra begge kanter, ellers får man en stille
-- «konto uten kull» avhengig av hvilken rekkefølge ting skjedde i:
--   1. Rad først, så innlogging  → triggeren på auth.users kobler
--   2. Innlogging først, så rad  → triggeren på cohort_members kobler
--
-- Nr. 2 er ikke et hjørnetilfelle: de tre testbrukerne i prod finnes allerede.

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
     set profile_id   = p_profile,
         status       = case when status = 'invited' then 'active' else status end,
         activated_at = coalesce(activated_at, now())
   where profile_id is null
     and email is not null
     and lower(email) = lower(p_email);

  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.bb_claim_membership is
  'Kobler ventende medlemsrader til en profil via e-post. Rører aldri en rad som allerede har profile_id — en revoke skal ikke kunne omgås ved å logge inn på nytt.';

-- Kant 1: ny auth-bruker
create or replace function public.bb_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update set email = excluded.email;

  perform public.bb_claim_membership(new.id, new.email);
  return new;
end $$;

drop trigger if exists bb_on_auth_user_created on auth.users;
create trigger bb_on_auth_user_created
  after insert on auth.users
  for each row execute function public.bb_handle_new_user();

-- Kant 2: e-post settes på en medlemsrad der profilen alt finnes
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
    new.profile_id   := v_profile;
    new.status       := case when new.status = 'invited' then 'active' else new.status end;
    new.activated_at := coalesce(new.activated_at, now());
  end if;

  return new;
end $$;

drop trigger if exists bb_link_member on public.cohort_members;
create trigger bb_link_member
  before insert or update of email on public.cohort_members
  for each row execute function public.bb_link_member_on_email();

-- Backfill: auth-brukerne som allerede finnes fikk aldri kjørt triggeren.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;
