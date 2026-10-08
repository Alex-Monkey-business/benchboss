-- Hvor mange det skal være i hver gruppe på en øvelse.
--
-- Trenerne deler 1v1 og Y i grupper hver gang, og ville at appen skulle gjøre
-- det. Øvelsen sier størrelsen, ikke antallet: Y med fem i hver er fire
-- grupper når tjue kommer og to når ti kommer. Antallet er dagens, størrelsen
-- er øvelsens.
--
-- Hvem som havner sammen avgjøres av typen som allerede står på øvelsen:
-- diff = likt nivå i hver gruppe, mix = nivåene spredt. Ingen ny kolonne for
-- det.
--
-- Ingen backfill. «To og to per stasjon» står i gruppe-fritekst noen steder,
-- men hvilket tall som er størrelsen er en vurdering, ikke en regel.
alter table public.training_exercises
  add column if not exists per_gruppe integer
  check (per_gruppe is null or per_gruppe between 1 and 30);

comment on column public.training_exercises.per_gruppe is
  'Spillere per gruppe. Antall grupper regnes ut fra hvor mange som er på trening.';
