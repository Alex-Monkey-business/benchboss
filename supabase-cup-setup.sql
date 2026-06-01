-- ============================================================
-- BenchBoss – CUP-MODUL: komplett oppsett i ÉN fil (skjema + seed)
-- Trygt: lager kun NYE tabeller (cups, cup_matches). Rører ikke
-- players/matches/seasons. Idempotent – kan kjøres flere ganger uten skade.
-- Lim inn i Supabase → SQL Editor → Run.
-- ============================================================

-- --- Tabeller ---
create table if not exists public.cups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active','completed')),
  created_at timestamptz default now()
);

create table if not exists public.cup_matches (
  id uuid primary key default gen_random_uuid(),
  cup_id uuid not null references public.cups(id) on delete cascade,
  our_team text not null check (our_team in ('goat','han')),
  opponent text,
  match_date date,
  match_time time,
  pitch text,
  round text,
  home_score integer,
  away_score integer,
  created_at timestamptz default now()
);

create index if not exists idx_cup_matches_cup on public.cup_matches(cup_id);

-- --- RLS (samme allow_all-mønster som resten av appen) ---
alter table public.cups enable row level security;
alter table public.cup_matches enable row level security;
drop policy if exists allow_all on public.cups;
create policy allow_all on public.cups for all to public using (true) with check (true);
drop policy if exists allow_all on public.cup_matches;
create policy allow_all on public.cup_matches for all to public using (true) with check (true);

-- --- Seed: cupen (kun hvis den ikke finnes) ---
insert into public.cups (name, venue, start_date, end_date)
select 'Bø Sommerland Cup', 'Telemark', date '2026-06-06', date '2026-06-07'
where not exists (select 1 from public.cups where name = 'Bø Sommerland Cup');

-- --- Seed: kampprogram (kun hvis cupen ikke har kamper ennå) ---
insert into public.cup_matches (cup_id, our_team, opponent, match_date, match_time, pitch, round)
select c.id, v.our_team, v.opponent, v.match_date, v.match_time, v.pitch, v.round
from (values
  ('han',  'Ski IL Fotball Juniors', date '2026-06-06', time '10:40', 'T7 3 Telemarkshallen', 'Kamp 68'),
  ('han',  'Birkenes IL',            date '2026-06-06', time '12:40', 'T7 2 Telemarkshallen', 'Kamp 109'),
  ('han',  'Siljan IL',              date '2026-06-07', time '12:40', 'T7 2 Telemarkshallen', 'Kamp 329'),
  ('goat', 'Sørfjell IL',            date '2026-06-06', time '14:40', 'T7 1 Telemarkshallen', 'Kamp 148'),
  ('goat', 'Siggerud IL',            date '2026-06-06', time '16:00', 'T7 2 Telemarkshallen', 'Kamp 177'),
  ('goat', 'Skrim Silver',           date '2026-06-07', time '13:20', 'S7 1 Sandvoll',        'Kamp 333')
) as v(our_team, opponent, match_date, match_time, pitch, round)
cross join (select id from public.cups where name = 'Bø Sommerland Cup' limit 1) c
where not exists (
  select 1 from public.cup_matches cm
  where cm.cup_id = (select id from public.cups where name = 'Bø Sommerland Cup' limit 1)
);

-- --- Verifiser ---
select (select count(*) from public.cups) as cups,
       (select count(*) from public.cup_matches) as cup_matches;
