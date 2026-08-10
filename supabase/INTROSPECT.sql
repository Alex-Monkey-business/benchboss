-- Fasit for hva som FAKTISK står i databasen.
--
-- De 18 løse .sql-filene i repo-rota kan ikke rekonstruere skjemaet: cups og
-- cup_matches er definert to steder, referees har RLS på i én fil og av i en
-- annen, og ingenting registrerer hva som er kjørt. Denne spørringen leser
-- pg_catalog og svarer på det.
--
-- Read-only. Rører ingenting. Kjør i Supabase → SQL Editor, last ned som CSV
-- hvis output blir avkortet.
--
-- Kjør den mot BÅDE prod og staging etter at staging er satt opp — poenget med
-- staging er at de to er like, og dette er eneste måten å vite det på.

select jsonb_pretty(jsonb_build_object(
  'generated_at',   now(),
  'server_version', current_setting('server_version'),

  -- Er RLS på? Er den FORCED (som ville brutt SECURITY DEFINER-hjelperne)?
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'est_rows', c.reltuples::bigint
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  ),

  'columns', (
    select jsonb_agg(jsonb_build_object(
      'table', table_name, 'column', column_name, 'type', data_type,
      'nullable', is_nullable, 'default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns where table_schema = 'public'
  ),

  -- CHECK-constraintene på cup-slugs og team-slugs er de som har krevd DDL før.
  'constraints', (
    select jsonb_agg(jsonb_build_object(
      'table', rel.relname, 'name', con.conname, 'def', pg_get_constraintdef(con.oid)
    ) order by rel.relname, con.conname)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
  ),

  'indexes', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'name', indexname, 'def', indexdef)
      order by tablename, indexname)
    from pg_indexes where schemaname = 'public'
  ),

  -- Forventet: allow_all overalt. Alt annet er en overraskelse vi vil vite om.
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname, 'permissive', permissive,
      'roles', roles, 'cmd', cmd, 'using', qual, 'check', with_check
    ) order by tablename, policyname)
    from pg_policies where schemaname = 'public'
  ),

  'triggers', (
    select jsonb_agg(jsonb_build_object('table', c.relname, 'name', t.tgname,
      'def', pg_get_triggerdef(t.oid)) order by c.relname, t.tgname)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
  ),

  'functions', (
    select jsonb_agg(jsonb_build_object('name', p.proname, 'secdef', p.prosecdef,
      'args', pg_get_function_identity_arguments(p.oid), 'config', p.proconfig)
      order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),

  -- Et view uten security_invoker er et hull rett gjennom RLS.
  'views', (
    select jsonb_agg(jsonb_build_object('name', c.relname, 'options', c.reloptions)
      order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v','m')
  ),

  -- Hva anon faktisk har lov til i dag. Denne skal krympe, ikke forsvinne
  -- brått: foreldre uten konto leser fortsatt via anon i overgangen.
  'anon_grants', (
    select jsonb_agg(distinct jsonb_build_object('table', table_name, 'priv', privilege_type))
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
  ),

  'auth_user_count', (select count(*) from auth.users),

  -- Tom liste = CLI-en har aldri kjørt mot denne databasen.
  'migration_ledger', (
    select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
    from supabase_migrations.schema_migrations
  )
));


-- Radtall. Sier hvor stor backfillen blir, og hvilke tabeller som nærmer seg
-- API-takets 1000 rader (match_stints kommer først).
select 'matches' t, count(*) n from public.matches
union all select 'match_stints',        count(*) from public.match_stints
union all select 'match_goals',         count(*) from public.match_goals
union all select 'match_players',       count(*) from public.match_players
union all select 'match_absences',      count(*) from public.match_absences
union all select 'match_coaches',       count(*) from public.match_coaches
union all select 'match_sessions',      count(*) from public.match_sessions
union all select 'players',             count(*) from public.players
union all select 'player_season_teams', count(*) from public.player_season_teams
union all select 'expenses',            count(*) from public.expenses
union all select 'seasons',             count(*) from public.seasons
union all select 'coaches',             count(*) from public.coaches
union all select 'referees',            count(*) from public.referees
union all select 'cups',                count(*) from public.cups
union all select 'cup_matches',         count(*) from public.cup_matches
union all select 'cup_squad',           count(*) from public.cup_squad
union all select 'cup_match_goals',     count(*) from public.cup_match_goals
union all select 'training_periods',    count(*) from public.training_periods
union all select 'training_sessions',   count(*) from public.training_sessions
union all select 'training_exercises',  count(*) from public.training_exercises
order by n desc;
