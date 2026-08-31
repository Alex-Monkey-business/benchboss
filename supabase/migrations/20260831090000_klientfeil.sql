-- Feil fra ekte enheter, i basen vi allerede har
--
-- Sten fant fire ting på én dag. Vi fant null, fordi ingenting fortalte oss noe.
-- Den døde knappen ga ingen feilmelding — den klassen tar `check:writes` og
-- tomhetssveipet i QA-en nå. Men en ekte krasj på en ekte telefon har vi
-- fortsatt ingen anelse om.
--
-- Ikke Sentry. BenchBoss inneholder navn på mindreårige, og feilrapporter bærer
-- kontekst: ruter med spiller-id-er, props, breadcrumbs. Å sende det til en
-- tredjepart flytter barnedata ut av basen uten at noen har bestemt det.
-- Backupene ligger utenfor repoet av nøyaktig samme grunn.
--
-- KOLONNENE ER MED VILJE GENERISKE. Alex skal ha ett dashbord over alle
-- prosjektene sine — BenchBoss, Simons side, hans egen. Får hvert prosjekt sin
-- egen form, blir dashbordet en integrasjon per prosjekt. Får de samme form,
-- er det en union. `project` står her selv om denne basen bare har ett.
create table if not exists public.client_errors (
  id           uuid primary key default gen_random_uuid(),
  project      text        not null default 'benchboss',
  occurred_at  timestamptz not null default now(),
  kind         text        not null,
  message      text        not null,
  stack        text,
  route        text,
  release      text,
  -- Gruppering. Samme feil hundre ganger er én sak, ikke hundre.
  fingerprint  text        not null,
  cohort_id    uuid references public.cohorts(id) on delete set null,
  role         text,
  user_agent   text,
  -- Kvittert ut. Null = ubehandlet.
  resolved_at  timestamptz
);

create index if not exists client_errors_fingerprint_idx
  on public.client_errors (project, fingerprint, occurred_at desc);
create index if not exists client_errors_open_idx
  on public.client_errors (occurred_at desc) where resolved_at is null;

comment on table public.client_errors is
  'Krasj fra ekte enheter. Generisk form med vilje: samme kolonner i hvert prosjekt gjør et felles dashbord til en union, ikke en integrasjon per prosjekt.';
comment on column public.client_errors.fingerprint is
  'message + første stack-ramme, hashet i klienten. Samme feil hundre ganger er én sak.';
comment on column public.client_errors.cohort_id is
  'Hvilket kull brukeren sto i. ON DELETE SET NULL — en slettet kull skal ikke ta feilhistorikken med seg.';

alter table public.client_errors enable row level security;

-- Skriving: enhver innlogget bruker melder sine egne krasj. Det er hele
-- poenget — en feil som bare oppstår hos Sten må kunne rapporteres av Sten.
drop policy if exists client_errors_insert on public.client_errors;
create policy client_errors_insert on public.client_errors
  for insert to authenticated
  with check (true);

-- Lesing: bare plattform-admin. En trener skal ikke se stacktracer fra andre
-- kull, og en forelder skal ikke se dem i det hele tatt.
drop policy if exists client_errors_select on public.client_errors;
create policy client_errors_select on public.client_errors
  for select to authenticated
  using (public.bb_is_platform_admin());

drop policy if exists client_errors_update on public.client_errors;
create policy client_errors_update on public.client_errors
  for update to authenticated
  using (public.bb_is_platform_admin())
  with check (public.bb_is_platform_admin());

revoke all on public.client_errors from anon;
