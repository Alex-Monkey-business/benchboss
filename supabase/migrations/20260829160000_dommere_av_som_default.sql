-- Dommere er en Halsen-greie, ikke en fotball-greie.
--
-- Halsen skaffer dommer til hver hjemmekamp og fører utlegg for det. De fleste
-- klubber gjør ikke det, og et nytt kull skal ikke møte en dommerliste, et
-- dommerfelt på kampen og «Dommer mangler» i Å ordne for noe de aldri skal
-- gjøre. Den som faktisk skaffer dommer slår det på i Admin → Dommere.
--
-- KUN defaulten endres. Eksisterende kull står som de står — Halsen G2015 har
-- en sesong med ekte dommere og utlegg i seg, og skal ikke røres.
alter table public.cohorts
  alter column uses_referees set default false;

comment on column public.cohorts.uses_referees is
  'Skaffer kullet dommer selv? Av som default — det er unntaket, ikke regelen. Slås på i Admin → Dommere.';
