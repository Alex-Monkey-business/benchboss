-- Fikstur for scripts/treningsuke-test.mjs: augustplanen til Halsen G2015 med
-- tre dager og 3/2/4 øvelser. Lørdagen med fire er caset som utløste
-- omleggingen — den var 1140 px høy på en 390-skjerm.
--
-- Kjør mot den LOKALE stacken:
--   docker exec -i -e PGPASSWORD=postgres supabase_db_halsen-dommerutlegg \
--     psql -U supabase_admin -h 127.0.0.1 -d postgres -q -f - < scripts/seed-treningsuke-lokalt.sql

alter table public.training_sessions add column if not exists duration_min integer;
alter table public.training_exercises add column if not exists gruppe text;
alter table public.training_exercises add column if not exists utstyr text;

delete from training_sessions where cohort_id='af104bf3-02f4-4067-a0db-bf285f5d8f39';
delete from training_periods where cohort_id='af104bf3-02f4-4067-a0db-bf285f5d8f39';
insert into training_periods (id,title,lead,start_date,end_date,position,cohort_id)
values ('11111111-1111-1111-1111-111111111111','August','Sjef over ballen, grunnferdigheter og spill med mye involvering.','2026-08-01','2026-08-31',0,'af104bf3-02f4-4067-a0db-bf285f5d8f39');
insert into training_sessions (period_id,title,weekday,position,accent,duration_min,focus,drills,cohort_id) values
('11111111-1111-1111-1111-111111111111','Tirsdag',2,0,'sky',90,'Ferdigheter under press. Bli sjef over ballen i trange rom — medtak, vending og første touch som tar deg ut av presset.',
'[{"type":"diff","text":"Medtak, dribling, vending og pasning","tema":"Spille oss fremover","minutes":20,"laeringsmomenter":["Mykt medtak ut til siden — fremover på andre touch","Løft blikket og finn timing på finta","Finte med tempo og store bevegelser for å passere"],"gruppe":"To og to per stasjon.","utstyr":"Kjegler, porter, én ball per par.","organisering":"Pasning gjennom port, retningsbestemt medtak, dribling forbi kjegler, finte mot passivt press, vending ved siste kjegle.\n\nBytt roller.","link":{"label":"Medtak, dribling, vending, pasning","url":"https://tiim.no/ovelse/medtak-dribling-vending-pasning"}},{"type":"diff","text":"3v3 med press i ryggen","tema":"Fart i angrep, hold overtaket","minutes":20,"gruppe":"To baner med småmål. Tre spillere per lag.","utstyr":"Fire småmål, vester, ballkurv hos trener.","organisering":"To forsvarere står ved eget mål; den siste starter bak angrepslagets mål og jager i press straks angriperne får ballen fra trener.\n\nVariasjon: forsvarslaget forsvarer to mål.","link":null},{"type":"mix","text":"Vinneren står","tema":"Tempo og lite dødtid","minutes":25,"organisering":"To lag spiller kort 7er — ny kamp straks det er mål. De to andre roterer ved siden: ett på styrke, ett på en lettbeint øvelse.","link":null}]'::jsonb,'af104bf3-02f4-4067-a0db-bf285f5d8f39'),
('11111111-1111-1111-1111-111111111111','Torsdag',4,1,'peach',90,'Grunnferdigheter og spill. Ferdighetssirkel for å bli sjef over ballen, så smålagsspill 3v3 med mye involvering.',
'[{"type":"mix","text":"Ferdighetssirkel","tema":"Sjef over ballen","minutes":20,"organisering":"Avsluttes med press.","link":null},{"type":"diff","text":"Vinneren står — 3v3 på småmål","tema":"Spille fremover","minutes":30,"organisering":"30 min. Tre baner, én fast joker (A-spiller) per bane. Differensiert i nivå A, B og C — tre lag à tre per bane.","link":null}]'::jsonb,'af104bf3-02f4-4067-a0db-bf285f5d8f39'),
('11111111-1111-1111-1111-111111111111','Lørdag',6,2,'olive',90,'Spill og mestring. Mye touch, små lag, mange mål — la dem prøve det vi har trent på.',
'[{"type":"diff","text":"Utvidet Barça-oppvarming","tema":"Sjef over ballen","minutes":15,"laeringsmomenter":["Begge føtter, hele foten i bruk","Blikket opp mellom hver berøring"],"organisering":"Innside, utside, såle, vendinger og finter med begge føtter, rundt kjegler.","link":null},{"type":"diff","text":"Eggs (transition game)","tema":"Omstilling","minutes":20,"organisering":"4v4, 3v3 eller 2v2 ut fra antall.","link":{"label":"Eggs Transition Game – 4v4 til 4v3","url":"https://tiim.no/ovelse/eggs-transition-game-4v4-til-4v3"}},{"type":"mix","text":"4v4-turnering","tema":"Mange involveringer","minutes":25,"organisering":"Korte baner, helst med store mål.","link":null},{"type":"none","text":"Tverrliggerkonkurranse og killer","minutes":10,"organisering":"Avslutning. To lag, poeng på treff.","link":null}]'::jsonb,'af104bf3-02f4-4067-a0db-bf285f5d8f39');
