-- ============================================================
-- BenchBoss – SANDARCUPEN 2026 (8.–9. august, Virik Idrettspark)
-- Alt i ÉN fil: nye lag-slugs, cup, kampprogram, tropp.
-- Idempotent – kan kjøres flere ganger uten skade.
-- Lim inn i Supabase → SQL Editor → Run.
-- NB: `drop constraint` under trigger Supabase sin "destructive"-advarsel.
-- Det er trygt – vi gjenskaper checken umiddelbart med flere lovlige verdier.
-- ============================================================

-- --- 1) Nye lag-slugs: utvid checkene (goat/han beholdes for Bø-historikken) ---
alter table public.cup_matches drop constraint if exists cup_matches_our_team_check;
alter table public.cup_matches add constraint cup_matches_our_team_check
  check (our_team in ('goat','han','halsen','halsen2'));

alter table public.cup_squad drop constraint if exists cup_squad_cup_team_check;
alter table public.cup_squad add constraint cup_squad_cup_team_check
  check (cup_team in ('goat','han','halsen','halsen2'));

-- --- 2) Bø-cupen er historie ---
update public.cups set status = 'completed' where name = 'Bø Sommerland Cup';

-- --- 3) Cupen (kun hvis den ikke finnes) ---
insert into public.cups (name, venue, start_date, end_date, status)
select 'Sandarcupen', 'Virik Idrettspark, Sandefjord', date '2026-08-08', date '2026-08-09', 'active'
where not exists (select 1 from public.cups where name = 'Sandarcupen');

-- --- 4) Kampprogram (kun hvis cupen ikke har kamper ennå) ---
insert into public.cup_matches (cup_id, our_team, opponent, match_date, match_time, pitch, round)
select c.id, v.our_team, v.opponent, v.match_date, v.match_time, v.pitch, v.round
from (values
  -- Halsen IF (Simon/Trond)
  ('halsen',  'Korsvoll Rovers',        date '2026-08-08', time '11:00', 'Virik 3', 'Kamp 436'),
  ('halsen',  'Svene IL',               date '2026-08-08', time '12:30', 'Virik 5', 'Kamp 627'),
  ('halsen',  'Ready Smestad',          date '2026-08-08', time '14:00', 'Virik 3', 'Kamp 841'),
  ('halsen',  'Fossum IF Skien',        date '2026-08-09', time '09:30', 'Virik 7', 'Kamp 1481'),
  ('halsen',  'FK Eik Tønsberg Hvit',   date '2026-08-09', time '11:00', 'Virik 7', 'Kamp 1678'),
  ('halsen',  'Ready Grønn',            date '2026-08-09', time '12:30', 'Virik 1', 'Kamp 1837'),
  -- Halsen IF 2 (Alex/Iver)
  ('halsen2', 'Haugfoss IF',            date '2026-08-08', time '10:30', 'Virik 6', 'Kamp 379'),
  ('halsen2', 'Korsvoll Thistle',       date '2026-08-08', time '12:00', 'Virik 5', 'Kamp 565'),
  ('halsen2', 'Ready Blå',              date '2026-08-08', time '14:30', 'Virik 4', 'Kamp 966'),
  ('halsen2', 'Rolvsøy IF',             date '2026-08-08', time '17:00', 'Virik 8', 'Kamp 1204'),
  ('halsen2', 'Korsvoll of Midlothian', date '2026-08-09', time '08:30', 'Virik 8', 'Kamp 1331'),
  ('halsen2', 'Stridsklev IL',          date '2026-08-09', time '10:30', 'Virik 3', 'Kamp 1604')
) as v(our_team, opponent, match_date, match_time, pitch, round)
cross join (select id from public.cups where name = 'Sandarcupen' limit 1) c
where not exists (
  select 1 from public.cup_matches cm
  where cm.cup_id = (select id from public.cups where name = 'Sandarcupen' limit 1)
);

-- --- 5) Tropp: match fornavn fra Hoopit-innlegget mot players ---
-- Prefiks-match på navn. Kollisjonene fra Bø (Emrik/Emerik, Kornelius/Cornelius)
-- er håndtert ved at begge stavemåter står som distinkte prefikser her.
insert into public.cup_squad (cup_id, player_id, cup_team)
select c.id, p.id, v.team
from (values
  -- Halsen IF
  ('Lennox',    'halsen'),
  ('Kasper',    'halsen'),
  ('Emrik',     'halsen'),
  ('Kornelius', 'halsen'),
  ('Theo',      'halsen'),
  ('Andreas',   'halsen'),
  ('Eremias',   'halsen'),
  ('Aksel',     'halsen'),
  ('William',   'halsen'),
  ('Matheo',    'halsen'),
  ('Jonas',     'halsen'),
  -- Halsen IF 2
  ('Elias',     'halsen2'),
  ('Syver',     'halsen2'),
  ('Cornelius', 'halsen2'),
  ('Edvin',     'halsen2'),
  ('Julian',    'halsen2'),
  ('Emerik',    'halsen2'),
  ('Isak',      'halsen2'),
  ('Theis',     'halsen2'),
  ('Kyryl',     'halsen2'),
  ('Eilert',    'halsen2'),
  ('Torbjørn',  'halsen2')
) as v(first, team)
join public.players p on p.name ilike v.first || '%'
cross join (select id from public.cups where name = 'Sandarcupen' limit 1) c
on conflict (cup_id, player_id) do nothing;

-- --- 6) Verifiser ---
-- a) Fornavn fra innlegget som IKKE traff noen spiller (disse må inn manuelt i appen):
select v.first as ikke_funnet, v.team
from (values
  ('Lennox','halsen'),('Kasper','halsen'),('Emrik','halsen'),('Kornelius','halsen'),
  ('Theo','halsen'),('Andreas','halsen'),('Eremias','halsen'),('Aksel','halsen'),
  ('William','halsen'),('Matheo','halsen'),('Jonas','halsen'),
  ('Elias','halsen2'),('Syver','halsen2'),('Cornelius','halsen2'),('Edvin','halsen2'),
  ('Julian','halsen2'),('Emerik','halsen2'),('Isak','halsen2'),('Theis','halsen2'),
  ('Kyryl','halsen2'),('Eilert','halsen2'),('Torbjørn','halsen2')
) as v(first, team)
where not exists (select 1 from public.players p where p.name ilike v.first || '%');

-- b) Fasit: tropp per lag (forvent 11 + 11) og antall kamper (forvent 12):
select cs.cup_team, count(*) as spillere, string_agg(p.name, ', ' order by p.name) as tropp
from public.cup_squad cs
join public.players p on p.id = cs.player_id
join public.cups c on c.id = cs.cup_id and c.name = 'Sandarcupen'
group by cs.cup_team;

select count(*) as kamper from public.cup_matches cm
join public.cups c on c.id = cm.cup_id and c.name = 'Sandarcupen';
