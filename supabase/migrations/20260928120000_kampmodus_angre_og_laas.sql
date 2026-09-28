-- Kampmodus, runde to: angring og to låsehull.
--
-- 1. Angre et bytte gikk rett mot tabellen fra telefonens egen kopi, som kan
--    være tre sekunder gammel. Har en annen trener byttet innbytteren ut igjen
--    i mellomtiden, ga angringa to spillere på samme plass og slettet
--    spilletid. Nå er angringa en låst funksjon som sjekker serverens tilstand.
-- 2. mm_keeper leste keeperen før sesjonen var låst. To trenere som valgte
--    hver sin keeper samtidig kunne gi to keepere.
-- 3. omgang_slutt tok imot et hvilket som helst sekundtall. En telefon som
--    våknet sent kunne spole klokka bak perioder som startet etter pausen.
--
-- Bare funksjoner; appen faller tilbake til den gamle angringa til denne er inne.

create or replace function public.mm_angre_bytte(p_match uuid, p_ut_stint uuid, p_inn_stint uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare s public.match_sessions; inn public.match_stints; ut public.match_stints;
begin
  select * into s from public.match_sessions where match_id = p_match for update;
  if not found or s.status not in ('running', 'paused') then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  -- Innbytteren må fortsatt stå på banen, i perioden byttet åpnet.
  select * into inn from public.match_stints
   where id = p_inn_stint and match_id = p_match and off_clock is null for update;
  if not found then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  if p_ut_stint is not null then
    -- Den gamle perioden må være den byttet lukket, og spilleren må ikke
    -- ha kommet inn igjen på en annen måte.
    select * into ut from public.match_stints
     where id = p_ut_stint and match_id = p_match for update;
    if not found or ut.off_clock is distinct from inn.on_clock
       or ut.position is distinct from inn.position
       or exists (select 1 from public.match_stints
                   where match_id = p_match and player_id = ut.player_id and off_clock is null) then
      return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
    end if;
  end if;
  delete from public.match_stints where id = inn.id;
  if p_ut_stint is not null then
    update public.match_stints set off_clock = null where id = ut.id;
  end if;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true);
end
$$;

create or replace function public.mm_keeper(p_match uuid, p_spiller uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare s public.match_sessions; k public.match_stints; t public.match_stints; klk integer;
begin
  select * into s from public.match_sessions where match_id = p_match for update;
  if not found or s.status not in ('running', 'paused') then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  select * into k from public.match_stints where match_id = p_match and role = 'keeper' and off_clock is null;
  if k.id is not null then
    if k.player_id = p_spiller then
      return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
    end if;
    -- Låsen på sesjonen er allerede vår; mm_bytt_plass tar den på nytt uten å vente.
    return public.mm_bytt_plass(p_match, k.player_id, p_spiller);
  end if;
  select * into t from public.match_stints where match_id = p_match and player_id = p_spiller and off_clock is null for update;
  if t.id is null then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  klk := public.mm_klokke(s);
  update public.match_stints set off_clock = klk where id = t.id;
  insert into public.match_stints (match_id, player_id, role, position, on_clock) values (p_match, p_spiller, 'keeper', t.position, klk);
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true);
end
$$;

create or replace function public.mm_klokkehandling(p_match uuid, p_handling text, p_forventet text, p_sekunder integer default null)
returns jsonb
language plpgsql
security invoker
as $$
declare s public.match_sessions; klk integer; slutt integer;
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
    update public.match_sessions set status = 'paused', clock_base_seconds = slutt, running_since = null, updated_at = now() where match_id = p_match;
  elsif p_handling = 'avslutt' and s.status in ('running', 'paused') then
    update public.match_stints set off_clock = klk where match_id = p_match and off_clock is null;
    update public.match_sessions set status = 'finished', clock_base_seconds = klk, running_since = null, updated_at = now() where match_id = p_match;
  else
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true);
end
$$;

revoke all on function public.mm_angre_bytte(uuid, uuid, uuid) from public, anon;
grant execute on function public.mm_angre_bytte(uuid, uuid, uuid) to authenticated;
revoke all on function public.mm_keeper(uuid, uuid) from public, anon;
grant execute on function public.mm_keeper(uuid, uuid) to authenticated;
revoke all on function public.mm_klokkehandling(uuid, text, text, integer) from public, anon;
grant execute on function public.mm_klokkehandling(uuid, text, text, integer) to authenticated;
