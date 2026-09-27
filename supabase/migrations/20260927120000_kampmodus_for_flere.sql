-- Kampmodus for flere trenere samtidig.
--
-- Før skrev hver telefon hele sesjonsraden fra sin egen kopi. En trener som
-- bare ÅPNET oppsettet mens en annen sparket av, skrev status tilbake til
-- «setup» — med sju spillere på banen og en klokke som ikke fantes. Bytter
-- fra to telefoner lukket samme periode to ganger og satte to spillere på
-- samme plass.
--
-- Hver handling er nå én funksjon som låser sesjonsraden, sjekker at kampen
-- står slik telefonen tror, og gjør alt eller ingenting. Klokka regnes med
-- serverens tid, så to telefoner viser samme minutt. Stemmer ikke tilstanden,
-- svarer funksjonen ok=false og hele den ferske tilstanden, og flata tegner
-- seg på nytt fra den.
--
-- Security invoker: RLS gjelder som før, bare trenere i kullet kommer til.
-- Bare nye funksjoner og én indeks; gammel frontend virker uendret.

-- Én åpen periode per spiller. Det er invarianten alt annet hviler på: en
-- spiller kan ikke stå på banen to ganger.
create unique index if not exists match_stints_en_apen_per_spiller
  on public.match_stints (match_id, player_id) where off_clock is null;

create or replace function public.mm_klokke(s public.match_sessions)
returns integer
language sql stable
as $$
  select case
    when s.status = 'running' and s.running_since is not null
      then greatest(0, floor(s.clock_base_seconds + extract(epoch from (now() - s.running_since))))::integer
    else coalesce(s.clock_base_seconds, 0)
  end
$$;

-- Alt en kampmodus-skjerm trenger, i ett kall. Brukes både ved innlasting,
-- ved jevnlig henting og som svar fra hver handling.
create or replace function public.mm_tilstand(p_match uuid)
returns jsonb
language sql stable
security invoker
as $$
  select jsonb_build_object(
    'now', now(),
    'session', (select to_jsonb(s) from public.match_sessions s where s.match_id = p_match),
    'stints', coalesce((select jsonb_agg(to_jsonb(t) order by t.on_clock, t.created_at)
                        from public.match_stints t where t.match_id = p_match), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at)
                       from public.match_goals g where g.match_id = p_match), '[]'::jsonb),
    'score', (select jsonb_build_object('home_score', m.home_score, 'away_score', m.away_score)
              from public.matches m where m.id = p_match)
  )
$$;

-- Oppstillingen før avspark. Rører aldri en kamp som er i gang.
create or replace function public.mm_lagre_oppsett(p_match uuid, p_lineup jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare n integer;
begin
  insert into public.match_sessions (match_id, status, lineup, updated_at)
  values (p_match, 'setup', p_lineup, now())
  on conflict (match_id) do update
    set lineup = excluded.lineup, updated_at = now()
    where public.match_sessions.status = 'setup';
  get diagnostics n = row_count;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', n > 0);
end
$$;

-- Avspark. p_lineup = [{player_id, role, position}], p_config = {period_count,
-- period_minutes, lineup}. Bare fra oppsett; har noen andre sparket av, svarer
-- den ok=false uten å røre noe.
create or replace function public.mm_start(p_match uuid, p_lineup jsonb, p_config jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare n integer;
begin
  perform 1 from public.match_sessions where match_id = p_match for update;
  insert into public.match_sessions (match_id, status, clock_base_seconds, running_since, period,
                                     period_count, period_minutes, lineup, updated_at)
  values (p_match, 'running', 0, now(), 1,
          (p_config->>'period_count')::integer, (p_config->>'period_minutes')::integer,
          p_config->'lineup', now())
  on conflict (match_id) do update
    set status = 'running', clock_base_seconds = 0, running_since = now(), period = 1,
        period_count = excluded.period_count, period_minutes = excluded.period_minutes,
        lineup = coalesce(excluded.lineup, public.match_sessions.lineup), updated_at = now()
    where public.match_sessions.status = 'setup';
  get diagnostics n = row_count;
  if n = 0 then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  -- I oppsett finnes det ikke spilletid. Perioder som ligger der er rester
  -- fra en avbrutt økt og ville gitt to spillere på samme plass.
  delete from public.match_stints where match_id = p_match;
  insert into public.match_stints (match_id, player_id, role, position, on_clock)
  select p_match, (e->>'player_id')::uuid, coalesce(e->>'role', 'field'), e->>'position', 0
  from jsonb_array_elements(p_lineup) e;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true);
end
$$;

-- Klokka. p_handling: pause | fortsett | neste_omgang | omgang_slutt | avslutt.
-- p_forventet er statusen telefonen så; er den en annen, har noen andre
-- allerede gjort det, og ingenting skjer.
create or replace function public.mm_klokkehandling(p_match uuid, p_handling text, p_forventet text, p_sekunder integer default null)
returns jsonb
language plpgsql
security invoker
as $$
declare s public.match_sessions; klk integer;
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
    update public.match_sessions set status = 'paused', clock_base_seconds = coalesce(p_sekunder, klk), running_since = null, updated_at = now() where match_id = p_match;
  elsif p_handling = 'avslutt' and s.status in ('running', 'paused') then
    update public.match_stints set off_clock = klk where match_id = p_match and off_clock is null;
    update public.match_sessions set status = 'finished', clock_base_seconds = klk, running_since = null, updated_at = now() where match_id = p_match;
  else
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true);
end
$$;

-- Bytte: ut-spilleren må stå på banen og inn-spilleren på benken, ellers har
-- noen andre allerede byttet. Innbytteren arver rolle og plass.
create or replace function public.mm_bytte(p_match uuid, p_ut uuid, p_inn uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare s public.match_sessions; ut public.match_stints; klk integer; ny uuid;
begin
  select * into s from public.match_sessions where match_id = p_match for update;
  if not found or s.status not in ('running', 'paused') then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  select * into ut from public.match_stints where match_id = p_match and player_id = p_ut and off_clock is null for update;
  if not found or exists (select 1 from public.match_stints where match_id = p_match and player_id = p_inn and off_clock is null) then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  klk := public.mm_klokke(s);
  update public.match_stints set off_clock = klk where id = ut.id;
  insert into public.match_stints (match_id, player_id, role, position, on_clock)
  values (p_match, p_inn, ut.role, ut.position, klk) returning id into ny;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true, 'out_stint', ut.id, 'in_stint', ny);
end
$$;

-- Bytt plass mellom to på banen. Er keeperen med, bytter de hansker også:
-- keeperrollen er spilletid som telles for seg, så den lukkes og åpnes på
-- klokka. To utespillere bytter bare plass, uten ny periode.
create or replace function public.mm_bytt_plass(p_match uuid, p_a uuid, p_b uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare s public.match_sessions; a public.match_stints; b public.match_stints; klk integer;
begin
  select * into s from public.match_sessions where match_id = p_match for update;
  select * into a from public.match_stints where match_id = p_match and player_id = p_a and off_clock is null for update;
  select * into b from public.match_stints where match_id = p_match and player_id = p_b and off_clock is null for update;
  if coalesce(s.status, '') not in ('running', 'paused') or a.id is null or b.id is null or p_a = p_b then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  if a.role = b.role then
    update public.match_stints set position = b.position where id = a.id;
    update public.match_stints set position = a.position where id = b.id;
  else
    klk := public.mm_klokke(s);
    update public.match_stints set off_clock = klk where id in (a.id, b.id);
    insert into public.match_stints (match_id, player_id, role, position, on_clock)
    values (p_match, p_a, b.role, b.position, klk), (p_match, p_b, a.role, a.position, klk);
  end if;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true);
end
$$;

-- Gjør en på banen til keeper. Keeperen tar spillerens plass.
create or replace function public.mm_keeper(p_match uuid, p_spiller uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare k public.match_stints;
begin
  select * into k from public.match_stints where match_id = p_match and role = 'keeper' and off_clock is null;
  if k.id is null then
    declare s public.match_sessions; t public.match_stints; klk integer;
    begin
      select * into s from public.match_sessions where match_id = p_match for update;
      select * into t from public.match_stints where match_id = p_match and player_id = p_spiller and off_clock is null for update;
      if coalesce(s.status, '') not in ('running', 'paused') or t.id is null then
        return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
      end if;
      klk := public.mm_klokke(s);
      update public.match_stints set off_clock = klk where id = t.id;
      insert into public.match_stints (match_id, player_id, role, position, on_clock) values (p_match, p_spiller, 'keeper', t.position, klk);
      return public.mm_tilstand(p_match) || jsonb_build_object('ok', true);
    end;
  end if;
  if k.player_id = p_spiller then
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', false);
  end if;
  return public.mm_bytt_plass(p_match, k.player_id, p_spiller);
end
$$;

-- Resultatet som endring, ikke som tall. To trenere som trykker + samtidig
-- skal gi to mål, ikke ett.
create or replace function public.mm_maal(p_match uuid, p_hjemme integer, p_borte integer)
returns jsonb
language plpgsql
security invoker
as $$
declare n integer;
begin
  update public.matches
     set home_score = greatest(0, coalesce(home_score, 0) + p_hjemme),
         away_score = greatest(0, coalesce(away_score, 0) + p_borte)
   where id = p_match;
  get diagnostics n = row_count;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', n > 0);
end
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'mm_klokke(public.match_sessions)', 'mm_tilstand(uuid)', 'mm_lagre_oppsett(uuid, jsonb)',
    'mm_start(uuid, jsonb, jsonb)', 'mm_klokkehandling(uuid, text, text, integer)',
    'mm_bytte(uuid, uuid, uuid)', 'mm_bytt_plass(uuid, uuid, uuid)', 'mm_keeper(uuid, uuid)',
    'mm_maal(uuid, integer, integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
