-- Hvem bruker BenchBoss som installert app, og ikke i nettleseren.
--
-- Andelen kan telemetrien svare på alene, uten å vite hvem noen er. «Hvem»
-- kan den ikke, og skal ikke kunne: page_views er insert-åpen for anon, så en
-- bruker-id der kunne hvem som helst funnet på. Identiteten hører hjemme her,
-- i basen der auth.uid() faktisk verifiserer den.
alter table public.profiles
  add column if not exists pwa_sist_sett timestamptz;

comment on column public.profiles.pwa_sist_sett is
  'Sist gang brukeren åpnet appen installert (display-mode standalone, eller navigator.standalone på iOS). Null = alltid i nettleser.';

-- IKKE en UPDATE-policy på profiles.
--
-- RLS kan ikke begrense hvilke KOLONNER en policy slipper til. En policy som
-- lot brukeren oppdatere sin egen rad ville også latt henne sette
-- is_platform_admin på seg selv. Derfor en security definer-funksjon som
-- rører nøyaktig én kolonne på nøyaktig egen rad, og ingenting annet.
create or replace function public.bb_meld_pwa()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set pwa_sist_sett = now()
   where id = auth.uid();
$$;

revoke all on function public.bb_meld_pwa() from public, anon;
grant execute on function public.bb_meld_pwa() to authenticated;

comment on function public.bb_meld_pwa() is
  'Stempler egen profil som «åpnet som app». Security definer fordi profiles ikke har UPDATE-policy — og skal ikke få en, se migrasjonen.';
