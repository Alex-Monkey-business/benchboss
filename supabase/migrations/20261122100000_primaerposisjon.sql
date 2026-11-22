-- Primærposisjon (Alex, 22. nov 2026).
--
-- Posisjonene var av eller på, og alle talte likt når appen plasserte laget.
-- Iver satte dem opp som «hoved/reserve» (back/stopper). Primær er en egen
-- liste, ikke rekkefølgen i positions: «back» er venstre OG høyre back, så
-- en spiller kan ha flere primære. Tom = ingen forskjell, som før.
--
-- Ingen CHECK mot positions: appen skriver begge i samme oppdatering og
-- leser bare primære som også står i positions.
alter table public.players
  add column if not exists primary_positions text[] not null default '{}';

comment on column public.players.primary_positions is
  'Primærposisjonene: en delmengde av positions. Appen foretrekker disse når den plasserer laget.';
