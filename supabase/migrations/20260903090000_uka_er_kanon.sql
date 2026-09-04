-- Uka er kanon. Måneden eier ikke lenger dagene.
--
-- Modellen var: en periode (én måned, med start- og sluttdato) eide øktene,
-- og en ny måned ble laget ved å KOPIERE forrige måneds dager og øvelser.
-- Tre feilmodi fulgte av det:
--
--   1. Rytmen døde ved månedsslutt. Hver periode fikk end_date = siste dag i
--      måneden. Dagen etter fant verken /trening, Hjem eller foreldreflaten
--      noen gjeldende periode, og treninga forsvant fra appen — selv om laget
--      trente tirsdag som før.
--   2. Kopi-drift. Tre dager i tolv måneder er 36 rader som beskriver ÉN uke.
--      Retter du tirsdagsfokuset i én, står de elleve andre igjen med gammel
--      tekst.
--   3. Måneden var navigasjon uten reisemål: en velger, to sheets og en
--      arvingsmekanikk som bare fantes fordi lagringa krevde det. Overskriften
--      på siden sa allerede «Hver uke».
--
-- Nå: training_sessions er kullets uke, direkte. Én rad per treningsdag, ingen
-- utløpsdato, ingen kopiering. Endrer du tirsdag, er tirsdag endret.
--
-- Avvik på en enkeltdato («denne tirsdagen kjører vi keeperøkt») finnes fortsatt
-- ikke, og er den naturlige neste tingen å bygge. Den hører hjemme som et eget
-- lag OVER uka, ikke som en ny eier av dagene.
--
-- REKKEFØLGE. Denne filen er STEG 1 av to, og den er ufarlig i begge
-- retninger: ingenting slettes, ingenting droppes. Den gjør bare period_id
-- valgfri, slik at gammel og ny frontend kan kjøre mot samme base.
--
-- Grunnen til delingen: /trening fungerer i prod (gjeldende periode går til
-- 31.10), og en base som mister training_periods før den nye frontenden er ute
-- tar hele siden ned. Motsatt rekkefølge er heller ikke gratis — ny frontend
-- mot NOT NULL period_id feiler på hver ny treningsdag. Delt i to finnes ikke
-- vinduet: kjør denne, deploy, så steg 2 (20260904100000_perioden_ut.sql).
--
-- Den viktigste egenskapen er at et feilet bygg ikke kan etterlate prod i en
-- ødelagt tilstand. Med én migrasjon ville en feilet deploy låst /trening til
-- noen fikset byggingen.

-- ---------------------------------------------------------------------------
-- period_id blir valgfri
-- ---------------------------------------------------------------------------
--
-- Dette er hele steg 1. Gammel frontend sender fortsatt period_id og får den
-- lagret; ny frontend sender den ikke og får null. Begge fungerer.
--
-- Triggeren blir med VILJE stående som bb_cohort_from_period her. Den leser
-- cohort_id fra perioderaden, og det er entydig. bb_cohort_root leser kullet
-- fra medlemskapet og NEKTER å gjette når treneren har flere kull — bytter vi
-- den nå, kan en trener med to kull ikke lagre en treningsdag fra den gamle
-- frontenden. Byttet hører i steg 2, der period_id forsvinner samtidig.

alter table public.training_sessions alter column period_id drop not null;

-- Og triggeren må tåle at den er tom. bb_cohort_from_period gjør et blindt
-- «select cohort_id into new.cohort_id ... where id = new.period_id» — med
-- period_id null treffer den ingen rad, og into-en setter cohort_id til NULL.
-- Da faller innsettingen på cohort_id sin egen NOT NULL, og den nye frontenden
-- kan ikke lagre en treningsdag i det hele tatt.
--
-- Testet: uten dette feiler «insert med cohort_id, uten period_id» med
-- «null value in column cohort_id violates not-null constraint».
--
-- Gammel frontend sender alltid period_id, så for den er oppførselen uendret.
create or replace function public.bb_cohort_from_period()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.period_id is not null then
    select cohort_id into new.cohort_id from public.training_periods where id = new.period_id;
  end if;
  return new;
end $$;

-- Uka leses av kull og sorteres på ukedag. Indeksen legges nå, slik at den nye
-- frontenden har den fra første spørring — den koster ingenting for den gamle.
create index if not exists idx_training_sessions_uke
  on public.training_sessions (cohort_id, weekday);
