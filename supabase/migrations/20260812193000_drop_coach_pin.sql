-- Fase 4b: `coaches.pin` slettes.
--
-- Kolonnen sto igjen som NOT NULL etter fase 3, og blokkerte det første ekte
-- forsøket på å opprette en trener via invitasjonen — en ny trenerrad kan ikke
-- ha en PIN, for PIN-innlogging finnes ikke lenger.
--
-- Planen la sletting til fase 7. Men ingenting leser eller skriver den nå:
-- `verifyPin` er borte, og `fetchCoaches` henter `id, name`. Så lenge den blir
-- stående, ligger fem PIN-er i klartekst i en tabell hvem som helst med
-- anon-nøkkelen kan lese. Å utsette slettingen kjøper ingenting og koster det.
--
-- Dette lukker sikkerhetsgjelden som ble parkert 2026-04-29.

alter table public.coaches drop column if exists pin;
