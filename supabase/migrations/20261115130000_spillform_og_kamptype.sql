-- Spillform i appen, og kamptype på kampen
--
-- 1) Laget går fra 7er til 9er. Spillform og kamplengde bor på kullet, men
--    admin_cohort_update slipper bare admin gjennom, og da kunne en trener
--    bare endre dem via SQL. bb_cohort_set_format lar enhver aktiv trener i
--    kullet (og plattform-admin) sette akkurat disse tre kolonnene — ikke
--    navn, årgang eller dommere.
--
-- 2) Treningskamper og vinterserie ligger ikke i FIKS, og legges inn for hånd.
--    `kind` sier hva slags kamp det er. Null betyr «ukjent» — alt som er
--    importert fra FIKS før dette er seriekamper i praksis, men vi gjetter ikke.

create or replace function public.bb_cohort_set_format(
  p_cohort_id        uuid,
  p_players_on_pitch integer,
  p_period_count     integer,
  p_period_minutes   integer
)
returns public.cohorts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cohort public.cohorts;
begin
  -- `null = any(...)` er null, ikke false. Uten første ledd ville et manglende
  -- kull-id sklidd forbi sjekken.
  if p_cohort_id is null or not (
    p_cohort_id = any(public.bb_my_coach_cohorts())
    or public.bb_is_platform_admin()
  ) then
    raise exception 'Bare en trener i kullet kan endre spillformen'
      using errcode = '42501';
  end if;

  if p_players_on_pitch not in (3, 5, 7, 9, 11) then
    raise exception 'Spillformen må være 3, 5, 7, 9 eller 11' using errcode = '22023';
  end if;
  if p_period_count not between 1 and 4 or p_period_minutes not between 5 and 45 then
    raise exception 'Kamplengden er utenfor det som finnes' using errcode = '22023';
  end if;

  update public.cohorts
     set players_on_pitch = p_players_on_pitch,
         period_count     = p_period_count,
         period_minutes   = p_period_minutes
   where id = p_cohort_id
  returning * into v_cohort;

  if not found then
    raise exception 'Kullet finnes ikke' using errcode = '42704';
  end if;

  return v_cohort;
end;
$$;

comment on function public.bb_cohort_set_format is
  'Spillform og kamplengde fra Sesong-sida. Enhver aktiv trener i kullet. Rører bare players_on_pitch, period_count og period_minutes.';

revoke all on function public.bb_cohort_set_format(uuid, integer, integer, integer) from public, anon;
grant execute on function public.bb_cohort_set_format(uuid, integer, integer, integer) to authenticated;

-- Kamptype
alter table public.matches add column if not exists kind text;

alter table public.matches drop constraint if exists matches_kind_check;
alter table public.matches add constraint matches_kind_check
  check (kind is null or kind in ('serie', 'vinterserie', 'treningskamp'));

comment on column public.matches.kind is
  'serie / vinterserie / treningskamp. Null = ikke satt (FIKS-import før kolonnen fantes).';

notify pgrst, 'reload schema';
