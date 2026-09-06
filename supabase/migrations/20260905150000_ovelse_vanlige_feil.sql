-- «Vanlige feil» — det som går galt, og som treneren skal gripe inn på.
--
-- 4. sep lot vi det være: «se_etter» speilet ble «vanlige feil», dobbelt å
-- fylle ut. Alex så PocketCoach en gang til og vil ha det. Da får feltene
-- hver sin jobb: se_etter er tegnene på at øvelsen VIRKER, vanlige_feil er
-- det du ser når den ikke gjør det, og begge holdes til to-tre punkter.
-- Regelen er den samme som for resten: kan det ikke leses på tre sekunder
-- på banen, er det for langt.
--
-- Tåler å ligge etter deployen — supportsVanligeFeil stripper feltet til
-- kolonnen finnes.
alter table public.training_exercises
  add column if not exists vanlige_feil jsonb not null default '[]';

comment on column public.training_exercises.vanlige_feil is
  'Det som typisk går galt i øvelsen. JSONB-array av korte punkter, to-tre stykker.';
