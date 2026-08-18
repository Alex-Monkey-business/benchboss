-- Ansvarsområdene ut av `src/content/ansvar.js` og inn i basen.
--
-- De ble lagt inn som innholdsfil da møtereferatet kom, med begrunnelsen at
-- ingen skulle redigere dem i appen. Den premissen faller nå: trenerne får en
-- egen side (`/trener/:id`), og da skal ansvar settes der.
--
-- Bonus: koblingen går på `coach_id`, ikke på navn. `Jakob` mot `Jacob` slutter
-- å være et problem i det sekundet navnet ikke lenger er nøkkelen.
--
-- `area` er TEXT og ikke enum med vilje. Den kanoniske lista står i koden som
-- forslag i velgeren; et nytt område skal ikke koste en migrasjon.

create table if not exists public.coach_responsibilities (
  id         uuid primary key default gen_random_uuid(),
  cohort_id  uuid not null references public.cohorts(id) on delete cascade,
  coach_id   uuid not null references public.coaches(id) on delete cascade,
  area       text not null,
  created_at timestamptz not null default now(),
  unique (coach_id, area)
);

create index if not exists idx_coach_responsibilities_cohort
  on public.coach_responsibilities (cohort_id);

-- RLS etter samme mønster som 20260813073000_parents_read_only_new_tables.sql.
-- Uten dette står tabellen på ingenting: alle leser, alle skriver — inkludert
-- foreldre. Alle kan LESE hvem som har ansvar for hva; foreldre skal ikke endre.
alter table public.coach_responsibilities enable row level security;

drop policy if exists read_all on public.coach_responsibilities;
create policy read_all on public.coach_responsibilities
  for select to public using (true);

drop policy if exists write_unless_parent on public.coach_responsibilities;
create policy write_unless_parent on public.coach_responsibilities
  for insert to public with check (not public.bb_is_parent());

drop policy if exists update_unless_parent on public.coach_responsibilities;
create policy update_unless_parent on public.coach_responsibilities
  for update to public using (not public.bb_is_parent()) with check (not public.bb_is_parent());

drop policy if exists delete_unless_parent on public.coach_responsibilities;
create policy delete_unless_parent on public.coach_responsibilities
  for delete to public using (not public.bb_is_parent());

-- Fordelingen slik den er nå (18. august 2026). NB: dette er IKKE tabellen fra
-- referatet 16. august — ansvaret ble omfordelt etterpå. Dommere gikk fra Alex
-- til Iver, Keepertrener utgikk, og Headcoach og Tech kom til. Referatet står
-- som det ble skrevet; denne tabellen er hva som gjelder.
--
-- Sletter først kullets rader: da gir migrasjonen samme resultat enten den
-- kjøres for første gang eller oppå den gamle fordelingen.
do $$
declare v_cohort uuid;
begin
  select c.id into v_cohort
  from public.cohorts c
  join public.clubs k on k.id = c.club_id
  where k.slug = 'halsen-il' and c.slug = 'g2015';

  if v_cohort is null then
    raise notice 'Fant ikke Halsen G2015 — seeden hoppes over, tabellen står klar.';
    return;
  end if;

  delete from public.coach_responsibilities where cohort_id = v_cohort;

  insert into public.coach_responsibilities (cohort_id, coach_id, area)
  select v_cohort, c.id, m.area
  from (values
    ('Trond', 'Headcoach'),
    ('Trond', 'Kommunikasjon'),
    ('Alex',  'Cup'),
    ('Alex',  'Tech'),
    ('Iver',  'Øvelser'),
    ('Iver',  'Dommere'),
    ('Simon', 'Rigg og Hoopit'),
    ('Jacob', 'Materialforvalter')
  ) as m(coach_name, area)
  join public.coaches c on c.cohort_id = v_cohort and c.name = m.coach_name
  on conflict (coach_id, area) do nothing;
end $$;
