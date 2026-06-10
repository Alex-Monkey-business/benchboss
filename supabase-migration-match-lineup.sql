-- ============================================
-- Match mode: lagre oppstilling før avspark
-- Kjør dette i Supabase SQL Editor
-- ============================================
--
-- Oppstillingen i setup-fasen lagres fortløpende som { slotId: playerId }
-- på sesjonsraden (status 'setup'). Overlever refresh og deles mellom
-- trenernes enheter. Etter avspark blir den stående som startoppstilling.

ALTER TABLE match_sessions ADD COLUMN IF NOT EXISTS lineup JSONB;
