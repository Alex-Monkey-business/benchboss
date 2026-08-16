-- Lukker det offentlige hullet i benchboss.no.
--
-- Anon-nøkkelen ligger i JS-bundelen på nettsiden — den er ikke en hemmelighet
-- og kan ikke gjøres til én. Så lenge rollen `anon` hadde rettigheter, kunne
-- hvem som helst hente nøkkelen ut av bundelen og lese 27 barnenavn,
-- dommertelefoner, fravær og spilletid rett mot REST-API-et, helt utenom appen.
-- Og skrive.
--
-- Rettighetene sto igjen fordi Iver, Jacob og Trond gikk på legacy-broen og
-- leste gjennom `anon`. Broen ble stengt 2026-08-13 (`legacyAuth: false`).
-- Verifisert 2026-08-16 i nettleser: et utlogget besøk på syv ruter — og et
-- besøk med den gamle PIN-nøkkelen i localStorage — gjør NULL REST-kall.
-- Ingenting i appen bruker `anon` til data lenger.
--
-- Innloggede brukere er ikke berørt: de kjører som `authenticated`, som har
-- egne rettigheter og egne policyer. Det gjelder også Jacob og Trond den dagen
-- de logger inn.
--
-- Ruller tilbake med:
--   grant select, insert, update, delete on all tables in schema public to anon;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Uten denne ville neste tabell fått rettighetene tilbake automatisk: det er
-- Supabase' standard-privilegier som gir dem, ikke noe vi har skrevet. Samme
-- felle traff oss i fase 2, der hver ny tabell måtte revokes eksplisitt.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

do $$
declare n int;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon';
  if n > 0 then
    raise exception 'anon har fortsatt rettigheter på % tabellrader', n;
  end if;
end $$;
