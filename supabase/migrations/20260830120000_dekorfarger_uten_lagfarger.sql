-- Dekorfargene på økter og perioder skiller en tirsdag fra en torsdag. De skal
-- ikke bety noe — og derfor kan de ikke være lagfargene. «sage» var #3D5C44,
-- som er Halsen Grønn overalt ellers i appen, og «warm»/«peach» var #7A3A24,
-- som er Halsen Rød. Fargen sa noe den ikke mente.
--
-- «plum» og «taupe» kommer inn. De gamle navnene blir stående som lovlige, for
-- de ligger lagret på rader som fortsatt finnes — app.css peker dem videre til
-- de nye fargene i stedet for å la dem falle ut.
alter table public.training_sessions drop constraint if exists training_sessions_accent_check;
alter table public.training_sessions add constraint training_sessions_accent_check
  check (accent = any (array['sky','cornflower','olive','plum','taupe','warm','sage','peach']));

alter table public.training_periods drop constraint if exists training_periods_accent_check;
alter table public.training_periods add constraint training_periods_accent_check
  check (accent = any (array['sky','cornflower','olive','plum','taupe','warm','sage','peach']));
