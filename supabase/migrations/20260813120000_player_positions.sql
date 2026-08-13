-- Posisjonene en spiller passer i.
--
-- Dette er en TRENERVURDERING, ikke en fasit og ikke en regel. Den styrer
-- rekkefølgen på forslagene i kampmodus og ingenting annet — alle spillere kan
-- alltid velges til alle plasser. Samme trust-klasse som `loan_eligible`:
-- informasjon om et navngitt barn som bare trenere skal se (fase 6).
--
-- Verdiene speiler slot-gruppene i formasjonen (gk / d* / m* / f*), ikke
-- lag-slugs, så de er de samme uansett kull og formasjon.
alter table public.players
  add column if not exists positions text[] not null default '{}';

alter table public.players drop constraint if exists players_positions_check;
alter table public.players
  add constraint players_positions_check
  check (positions <@ array['keeper', 'forsvar', 'midtbane', 'angrep']::text[]);

comment on column public.players.positions is
  'Posisjoner spilleren passer i (trenervurdering). Sorterer forslag i kampmodus.';
