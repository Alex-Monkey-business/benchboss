-- Øvelsen sier hva den skal føre til, men ikke hva du gjør mens den pågår.
--
-- Læringsmomentene er målet: «Mykt medtak ut til siden». Gjennomføringen er
-- oppsettet: «Pasning gjennom port, dribling forbi kjegler». Mellom dem står
-- de tjue minuttene der treneren faktisk står på banen — og for dem har banken
-- ingen kolonne i dag.
--
-- To ting mangler, og de er ikke det samme:
--
--   se_etter    — hva du ser etter for å vite om øvelsen virker. Dette er
--                 tegnene, ikke målet: «Ballen trekkes tett bak støttefoten»,
--                 «Lavt tyngdepunkt i vendingen». En trener som vet hva han
--                 skal se etter, kan korrigere. En som bare har målet, kan
--                 bare håpe.
--   si_til_barna — de faktiske ordene du roper. «Selg skuddet.» «Vend raskt.»
--                 Fire korte fraser er verdt mer for en foreldretrener enn et
--                 avsnitt teori, fordi de kan brukes i det sekundet de trengs.
--
-- «Vanlige feil» er med vilje IKKE med. Den er nesten alltid se_etter speilet:
-- «tydelig skuddfinte» blir «for svak skuddfinte». Dobbelt å fylle ut, og
-- ingenting nytt å lese.
--
-- JSONB-array som laeringsmomenter, ikke text[] — samme form, samme kode-vei
-- ut i drills-JSONB på øktene.
--
-- Ingen backfill. Hva du ser etter i en øvelse er en trenervurdering, ikke noe
-- som kan utledes av teksten som står der. Feltene står tomme til noen fyller
-- dem, og seksjonen vises ikke før den har innhold.
--
-- Rekkefølge: denne TÅLER å ligge etter deployen. Appen sjekker om kolonnen
-- finnes (supportsSeEtter / supportsSiTilBarna) og lar være å skrive den hvis
-- ikke — samme mønster som gruppe, utstyr og category.
alter table public.training_exercises
  add column if not exists se_etter jsonb not null default '[]';

alter table public.training_exercises
  add column if not exists si_til_barna jsonb not null default '[]';

comment on column public.training_exercises.se_etter is
  'Tegnene på at øvelsen virker — hva treneren ser etter underveis. JSONB-array av korte punkter.';
comment on column public.training_exercises.si_til_barna is
  'Ordene treneren roper på banen. JSONB-array av korte fraser, ikke setninger.';
