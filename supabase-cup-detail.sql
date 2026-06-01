-- ============================================================
-- BenchBoss – CUP: resultat + målscorere + referat
-- Additivt: legger til report-kolonne på cup_matches og en ny
-- cup_match_goals-tabell. Rører ikke noe annet. Idempotent.
-- Lim inn i Supabase → SQL Editor → Run.
-- ============================================================

-- Kampreferat på cup-kampen (home_score/away_score finnes allerede)
alter table public.cup_matches add column if not exists report text;

-- Målscorere per cup-kamp (gjenbruker players-tabellen)
create table if not exists public.cup_match_goals (
  id uuid primary key default gen_random_uuid(),
  cup_match_id uuid not null references public.cup_matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  position int not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_cup_match_goals_match on public.cup_match_goals(cup_match_id);

alter table public.cup_match_goals enable row level security;
drop policy if exists allow_all on public.cup_match_goals;
create policy allow_all on public.cup_match_goals for all to public using (true) with check (true);
