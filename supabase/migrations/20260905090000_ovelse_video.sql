-- Videoen er den raskeste veien til å forstå en øvelse. Sytten øvelser i
-- banken, sju av dem med lenke til tiim.no — og lenka er et hopp ut av appen,
-- inn i en side med meny, cookie-banner og fire relaterte øvelser, midt i en
-- trening. Videoen på tiim er 20–50 sekunder og sier alt oppsettet prøver å
-- si med ord.
--
-- tiim (NFF) hoster videoene som vanlige MP4-filer på Qbrick sitt CDN, med
-- åpen CORS og range-støtte. Da kan de spilles rett i appen med en <video>-
-- tag — ingen spiller å laste, ingen tredjepart som følger treneren.
--
-- Formen: { url, poster, duration, source, source_url }. `source_url` er sida
-- videoen kom fra, og vises alltid ved siden av videoen: dette er NFF sitt
-- innhold, og appen viser det med avsender, ikke som sitt eget.
--
-- Fylles av scripts/tiim-video.mjs fra tiim-lenka på øvelsen. Treneren
-- skriver ikke MP4-adresser i et skjema — han limer inn tiim-lenka som før.
--
-- Rekkefølge: TÅLER å ligge etter deployen. supportsVideo i useExercises
-- stripper feltet fra lagring til kolonnen finnes.
alter table public.training_exercises
  add column if not exists video jsonb;

comment on column public.training_exercises.video is
  'Video av øvelsen: { url (mp4), poster (jpeg), duration (sek), source (f.eks. tiim), source_url }. Fylles fra tiim-lenka av scripts/tiim-video.mjs.';
