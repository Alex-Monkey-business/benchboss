-- Nøkkeltallene: hva øvelsen krever, lesbart på tre sekunder.
--
-- I dag står alt dette i fritekst. «Minimum 5, maksimum 9 per gruppe» ligger
-- midt i en gruppe-tekst, «12 småmål, mye kjegler og 27 baller» i en annen.
-- Ni avbud en tirsdag, og treneren må lese seg gjennom sytten avsnitt for å
-- finne ut hva som fortsatt går.
--
-- Fritekstfeltene blir IKKE erstattet. De bærer detaljene («27 baller», «25x20
-- meter»). Kolonnene her bærer det faste: antall, hva du trenger, hvor mye
-- plass. Fritekst forklarer, nøkkeltallene sorterer.
--
-- Tida er med vilje ikke her: den bor på drillen i økta (`minutes` i
-- drills-JSONB), fordi samme rondo er 10 minutter tirsdag og 20 lørdag.

alter table public.training_exercises
  add column if not exists min_spillere integer;

alter table public.training_exercises
  add column if not exists maks_spillere integer;

-- Utstyret som en fast liste, ikke fritekst. JSONB-array av kanoniske verdier
-- (smamal, store_mal, kjegler, porter, vester, baller, keeper) — de sju som
-- faktisk forekommer i banken i dag. Hentet ut av tekstene, ikke oppfunnet.
--
-- Poenget med en fast liste er at «småmål» og «4 småmål» og «småmål på hver
-- bane» er samme krav skrevet tre måter. Som tag er det ett krav.
alter table public.training_exercises
  add column if not exists utstyr_tags jsonb not null default '[]';

-- Plassbehov. To verdier, ikke fem: den ekte beslutningen er «har vi banen
-- eller står vi i gymsalen». Mellomkategorier ville krevd en vurdering per
-- øvelse uten å endre hva treneren gjør.
alter table public.training_exercises
  add column if not exists plass text
  check (plass is null or plass in ('liten', 'stor'));

-- Aldersgruppen står tom, og det er et valg.
--
-- Begrunnelsen for at `training_exercises` er den ENESTE klubb-scopede tabellen
-- (20260831140000) er at «en øvelse er ikke aldersbestemt, og et nytt kull i
-- Halsen skal arve klubbens bank i stedet for å starte på null». En nedre
-- aldersgrense motsier ikke det — den er en opplysning, ikke en filtrering —
-- men den kan ikke utledes av noe som står i banken. Å sette «10 år+» på
-- Napoli ville vært en fotballfaglig vurdering tatt av en migrasjon.
alter table public.training_exercises
  add column if not exists min_alder integer;

comment on column public.training_exercises.min_spillere is
  'Færreste spillere øvelsen fungerer med. Avgjør om den kan kjøres på en trening med mange avbud.';
comment on column public.training_exercises.maks_spillere is
  'Flest spillere før øvelsen må deles i to baner eller grupper.';
comment on column public.training_exercises.utstyr_tags is
  'Fast liste over hva øvelsen krever: smamal, store_mal, kjegler, porter, vester, baller, keeper. Detaljene står i utstyr-fritekst.';
comment on column public.training_exercises.plass is
  'liten (gymsal, kvart bane, sirkler) eller stor (halv/hel bane, flere baner).';
comment on column public.training_exercises.min_alder is
  'Nedre alder i år, vises som «10 år+». Opplysning, ikke filtrering — banken deles i hele klubben.';

alter table public.training_exercises
  drop constraint if exists training_exercises_spillere_check;
alter table public.training_exercises
  add constraint training_exercises_spillere_check
  check (
    (min_spillere is null or min_spillere between 1 and 30)
    and (maks_spillere is null or maks_spillere between 1 and 30)
    and (min_spillere is null or maks_spillere is null or min_spillere <= maks_spillere)
  );
