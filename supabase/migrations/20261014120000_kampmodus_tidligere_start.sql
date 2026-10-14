-- Kampmodus: «Startet dere tidligere?»
--
-- 14. okt glemte treneren å trykke «Start 2. omgang». Klokka sto på halvtid i
-- ti minutter etter at ballen rullet, og spilletiden måtte justeres for hånd
-- etterpå — ti overføringer, fire minutter.
--
-- Klokka er avledet: base + tid siden running_since. Å flytte starten bakover
-- er derfor bare å flytte running_since. Det som er ført etter trykket (bytter,
-- mål), skjedde egentlig N sekunder senere på kampklokka og flyttes like mye.
-- Perioder som starter eller slutter nøyaktig på basen, står: de tilhører
-- pausen, ikke omgangen.
--
-- omgang_slutt setter nå updated_at til når omgangen faktisk endte. Pausen
-- telles fra den, også når ingen telefon var åpen på 30:00.
--
-- Ny handling i mm_klokkehandling: 'tidligere_start', p_sekunder = hvor mange
-- sekunder tidligere omgangen startet. Bakoverkompatibel — ingen nye kolonner,
-- gamle klienter sender aldri handlingen.

create or replace function public.mm_klokkehandling(p_match uuid, p_handling text, p_forventet text, p_sekunder integer default null)
returns jsonb
language plpgsql
security invoker
as $$
declare s public.match_sessions; klk integer; slutt integer; grense integer;
begin
  select * into s from public.match_sessions where match_id = p_match for update;
  if not found or s.status is distinct from p_forventet then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  klk := public.mm_klokke(s);
  if p_handling = 'pause' and s.status = 'running' then
    update public.match_sessions set status = 'paused', clock_base_seconds = klk, running_since = null, updated_at = now() where match_id = p_match;
  elsif p_handling = 'fortsett' and s.status = 'paused' then
    update public.match_sessions set status = 'running', running_since = now(), updated_at = now() where match_id = p_match;
  elsif p_handling = 'neste_omgang' and s.status = 'paused' then
    update public.match_sessions set status = 'running', running_since = now(), period = s.period + 1, updated_at = now() where match_id = p_match;
  elsif p_handling = 'omgang_slutt' and s.status = 'running' then
    -- Omgangsgrensa fra telefonen, men aldri forbi serverens klokke og aldri
    -- bak en periode som allerede er åpnet.
    slutt := greatest(least(coalesce(p_sekunder, klk), klk),
                      coalesce((select max(on_clock) from public.match_stints where match_id = p_match and off_clock is null), 0));
    -- updated_at er når omgangen faktisk endte, ikke når en telefon merket
    -- det. Var skjermen låst på 30:00, skal «stått i» likevel telle derfra.
    update public.match_sessions set status = 'paused', clock_base_seconds = slutt, running_since = null,
      updated_at = least(now(), s.running_since + make_interval(secs => slutt - s.clock_base_seconds))
      where match_id = p_match;
  elsif p_handling = 'tidligere_start' and s.status = 'running' then
    -- Aldri mer enn en halvtime, og aldri forbi slutten av omgangen.
    grense := s.period * coalesce(s.period_minutes, 30) * 60;
    if p_sekunder is null or p_sekunder < 1 or p_sekunder > 1800 or klk + p_sekunder >= grense then
      return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
    end if;
    update public.match_stints set on_clock = on_clock + p_sekunder
      where match_id = p_match and on_clock > s.clock_base_seconds;
    update public.match_stints set off_clock = off_clock + p_sekunder
      where match_id = p_match and off_clock > s.clock_base_seconds;
    update public.match_goals set clock_seconds = clock_seconds + p_sekunder
      where match_id = p_match and clock_seconds > s.clock_base_seconds;
    update public.match_sessions set running_since = s.running_since - make_interval(secs => p_sekunder), updated_at = now() where match_id = p_match;
  elsif p_handling = 'avslutt' and s.status in ('running', 'paused') then
    update public.match_stints set off_clock = klk where match_id = p_match and off_clock is null;
    update public.match_sessions set status = 'finished', clock_base_seconds = klk, running_since = null, updated_at = now() where match_id = p_match;
  else
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true);
end
$$;

revoke all on function public.mm_klokkehandling(uuid, text, text, integer) from public, anon;
grant execute on function public.mm_klokkehandling(uuid, text, text, integer) to authenticated;
