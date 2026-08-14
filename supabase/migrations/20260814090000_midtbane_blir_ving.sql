-- «Midtbane» → «ving».
--
-- Etter at «sentral» kom, dekket «midtbane» bare de to kantene i 2-3-1 — men
-- verdien het fortsatt noe som omfattet begge. Vi bytter verdien, ikke bare
-- etiketten i UI-et: en kolonne som sier `midtbane` og betyr `ving` er en felle
-- for den som leser basen om et halvt år.
--
-- Trygt nå: tre spillere er merket. Om to uker hadde det vært 27.
alter table public.players drop constraint if exists players_positions_check;

update public.players
set positions = array_replace(positions, 'midtbane', 'ving')
where 'midtbane' = any (positions);

alter table public.players
  add constraint players_positions_check
  check (positions <@ array['keeper', 'forsvar', 'ving', 'sentral', 'angrep']::text[]);
