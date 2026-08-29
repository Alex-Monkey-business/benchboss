-- Dommere er ikke universelt. Halsen skaffer dommer til hver hjemmekamp og
-- fører utlegg for det; Stag trenger ikke tenke på det i det hele tatt.
--
-- Bryteren står på KULLET, ikke på klubben — selv om det som regel er en
-- klubbeslutning. Grunnen: alt annet som styrer hvordan en kamp fungerer
-- (players_on_pitch, period_count, period_minutes) bor på kullet, og
-- dommerplikten følger aldersklassen like mye som klubben. En klubb kan ha
-- 11-åringer med kretsdommer og 8-åringer uten. Én kolonne, begge tilfeller.
--
-- DEFAULT TRUE er hele poenget: hvert eksisterende kull oppfører seg
-- nøyaktig som før migrasjonen. Ingenting skrus av uten at noen sier det.

alter table public.cohorts
  add column if not exists uses_referees boolean not null default true;

comment on column public.cohorts.uses_referees is
  'Skaffer laget dommer selv? Av: dommerfeltet, dommerlista, dommerutlegg og
   påminnelsen om manglende dommer forsvinner fra flaten. Dataene blir stående
   — skrus den på igjen, er alt der. Default true, så gamle kull er urørt.';
