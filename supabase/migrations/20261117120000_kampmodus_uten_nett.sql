-- Kampmodus uten nett.
--
-- På sidelinja er dekningen dårlig. Mål, scorere og bytter legges nå i en kø
-- på telefonen og sendes når nettet er tilbake. En kø prøver igjen, og et
-- forsøk kan ha nådd fram selv om svaret ikke kom tilbake. Da må et nytt
-- forsøk ikke telle dobbelt:
--
-- 1. mm_maal tar en nøkkel. Samme nøkkel to ganger gir ett mål.
-- 2. mm_bytte tar klokka byttet ble gjort på. Uten den fikk et bytte gjort
--    uten nett tida da nettet kom tilbake, og spilletida ble feil.
--
-- Bare nye funksjoner og én tabell. Den gamle frontenden og de gamle
-- signaturene virker som før; appen faller tilbake til dem til denne er inne.

create table if not exists public.mm_kvitteringer (
  noekkel uuid primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.mm_kvitteringer enable row level security;

-- Bare for kamper treneren selv ser (RLS på matches gjelder i underspørringen).
drop policy if exists mm_kvitteringer_ny on public.mm_kvitteringer;
create policy mm_kvitteringer_ny on public.mm_kvitteringer
  for insert to authenticated
  with check (exists (select 1 from public.matches m where m.id = match_id));

-- «on conflict do nothing» må kunne se raden som allerede står der.
drop policy if exists mm_kvitteringer_se on public.mm_kvitteringer;
create policy mm_kvitteringer_se on public.mm_kvitteringer
  for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id));

revoke all on public.mm_kvitteringer from anon;
grant select, insert on public.mm_kvitteringer to authenticated;

create or replace function public.mm_maal(p_match uuid, p_hjemme integer, p_borte integer, p_noekkel uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare n integer;
begin
  insert into public.mm_kvitteringer (noekkel, match_id) values (p_noekkel, p_match)
  on conflict (noekkel) do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    -- Allerede ført: forrige forsøk nådde fram, bare svaret gjorde det ikke.
    return public.mm_tilstand(p_match) || jsonb_build_object('ok', true, 'gjentatt', true);
  end if;
  return public.mm_maal(p_match, p_hjemme, p_borte);
end
$$;

-- Bytte på en gitt kampklokke. Aldri senere enn klokka står nå, aldri før
-- ut-spilleren kom inn, og aldri før inn-spilleren sist gikk av.
create or replace function public.mm_bytte(p_match uuid, p_ut uuid, p_inn uuid, p_klokke integer)
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
  if p_klokke is not null then
    klk := least(klk, greatest(p_klokke, ut.on_clock,
      coalesce((select max(off_clock) from public.match_stints where match_id = p_match and player_id = p_inn), 0)));
  end if;
  update public.match_stints set off_clock = klk where id = ut.id;
  insert into public.match_stints (match_id, player_id, role, position, on_clock)
  values (p_match, p_inn, ut.role, ut.position, klk) returning id into ny;
  return public.mm_tilstand(p_match) || jsonb_build_object('ok', true, 'out_stint', ut.id, 'in_stint', ny);
end
$$;

do $$
declare f text;
begin
  foreach f in array array['mm_maal(uuid, integer, integer, uuid)', 'mm_bytte(uuid, uuid, uuid, integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
