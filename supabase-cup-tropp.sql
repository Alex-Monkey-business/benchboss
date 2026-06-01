-- ============================================================
-- BenchBoss – CUP: tropp (hvilke spillere på Goat/Han)
-- Slank roster-kobling. Ingen ansvar/foreldre. Trenere tildeler i appen.
-- Additivt, idempotent. Lim inn i Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists public.cup_squad (
  id uuid primary key default gen_random_uuid(),
  cup_id uuid not null references public.cups(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  cup_team text not null check (cup_team in ('goat','han')),
  created_at timestamptz default now(),
  unique (cup_id, player_id)
);

create index if not exists idx_cup_squad_cup on public.cup_squad(cup_id);

alter table public.cup_squad enable row level security;
drop policy if exists allow_all on public.cup_squad;
create policy allow_all on public.cup_squad for all to public using (true) with check (true);
