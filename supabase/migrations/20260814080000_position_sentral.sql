-- «Sentral» som egen posisjon.
--
-- «Midtbane» løy: i 2-3-1 er m2 den vanskeligste plassen på banen og m1/m3 to
-- av de enkleste. Én bøtte for alle tre påsto at den som kan spille kant kan
-- spille sentralt. Nå er de skilt — «midtbane» betyr kant/generell midtbane.
--
-- Ingen datamigrasjon: ingen eksisterende rad blir ugyldig, og de tre spillerne
-- som var merket beholder verdiene sine.
alter table public.players drop constraint if exists players_positions_check;
alter table public.players
  add constraint players_positions_check
  check (positions <@ array['keeper', 'forsvar', 'midtbane', 'sentral', 'angrep']::text[]);
