-- Kampene husker ikke at de ble endret.
--
-- 23. august: morgendagens kamp mot Nanset lå opprinnelig på tirsdag. Den ble
-- rettet til mandag — men var det vi som rettet, eller flyttet fotball.no den?
-- Basen kunne ikke svare. `created_at` er identisk for alle ni kampene i
-- avdelingen (bulk-importen 7. august), og noe annet tidsstempel fantes ikke.
-- Spørsmålet måtte avgjøres med en fersk Excel-eksport i stedet.
--
-- En terminliste endrer seg gjennom sesongen. Da må raden si når den sist ble
-- rørt, ellers står man like blind neste gang.

alter table public.matches
  add column if not exists updated_at timestamp with time zone;

-- Eksisterende rader får `created_at`, ikke now(). Vi vet ikke når de faktisk
-- ble endret, og å stemple alt med i dag ville vært en løgn som ser ut som data.
-- (Nanset-kampen ER endret uten at vi kan datere det — den historikken er tapt,
-- og det er greit: fra nå av fanges den.)
update public.matches set updated_at = created_at where updated_at is null;

alter table public.matches
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.bb_touch_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- `is distinct from` gjør at en update som ikke endrer noe heller ikke flytter
-- stempelet. Uten den ville en lagring uten endringer sett ut som en endring —
-- altså nøyaktig det tvetydige signalet kolonnen skal fjerne.
drop trigger if exists matches_touch_updated_at on public.matches;
create trigger matches_touch_updated_at
  before update on public.matches
  for each row
  when (old.* is distinct from new.*)
  execute function public.bb_touch_updated_at();
