-- Én øvelse har sju ting ved seg: navn, lengde, diff/mix, hva vi øver på,
-- hvordan vi deler opp gruppa, hva du må ha med ut, og hva øvelsen går ut på.
--
-- «hvordan vi deler opp gruppa» hadde ingen kolonne. Den ble skrevet inn i
-- organisering sammen med beskrivelsen, og de to måtte gjettes fra hverandre
-- ved rendring. Alle 17 øvelsene i banken viser samme mønster: første setning
-- er inndelingen («To baner med småmål.», «3 deling.», «Laget fordelt diff på
-- to baner.»), resten er øvelsen.
--
-- Ingen backfill: hvilken setning som er inndeling er en vurdering, ikke en
-- regel. Kolonnen står tom til noen fyller den, og organisering fortsetter å
-- vise det den viser i dag.
--
-- Utstyret sto samme sted: «Behov for 12 småmål, mye kjegler og 27 baller.»,
-- «25x20 meter.», «2 keepere og helst 2 7-ermål per bane.» Det er det du bærer
-- ut på banen — den mest operative linja i hele øvelsen, og den lå gjemt midt
-- i et avsnitt.
alter table public.training_exercises add column if not exists gruppe text;
alter table public.training_exercises add column if not exists utstyr text;

comment on column public.training_exercises.gruppe is
  'Hvordan spillergruppa deles opp: baner, lag, nivådeling, antall per stasjon.';
comment on column public.training_exercises.utstyr is
  'Hva du må ha med ut: mål, kjegler, vester, baller, banestørrelse.';
