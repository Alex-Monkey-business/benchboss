-- Hvor lenge varer økta?
--
-- Kjøres manuelt i Supabase SQL Editor — anon-nøkkelen kan ikke kjøre DDL.
-- Appen tåler at kolonnen mangler (den skjuler lengde-velgeren og lar være å
-- skrive feltet), så rekkefølgen på deploy og migrering spiller ingen rolle.

ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS duration_min INT;

-- Dagens rytme i G2015: halvannen time. Sett en startverdi på det som finnes,
-- så slipper du å ta stilling til det på hver eneste dag.
UPDATE training_sessions
   SET duration_min = 90
 WHERE duration_min IS NULL;
