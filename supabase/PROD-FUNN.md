# Faktisk tilstand i prod — 2026-08-12

Fra introspeksjon av `qhgtiioahameqevaugjp` (Halsen G2015, eu-west-1).
Erstatter gjetning basert på de 18 løse `.sql`-filene i repo-rota.

## Sikkerhet

Alle 20 tabellene: **RLS på, ikke FORCE**, og alle med nøyaktig én policy —
`allow_all [ALL → public] using(true) with check(true)`.

Det avklarer én tvetydighet: `supabase-migration-referees.sql:10` gjør
`DISABLE ROW LEVEL SECURITY`, men den var ikke det siste som ble kjørt.
`referees` har RLS på som alle andre.

**`anon` har `INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`
på samtlige tabeller.** `TRUNCATE` er verdt å lese to ganger: hvem som helst
med anon-nøkkelen fra JS-bundelen kan tømme en hvilken som helst tabell med
én forespørsel. Ikke bare lese og skrive — slette alt.

Ingen funksjoner, ingen views, ingen triggere. Blank tavle for fase 2.

## Drift mellom repo og prod — begge veier

**1. `match_sessions` mangler `period_count` og `period_minutes`.**
`supabase-migration-match-period-config.sql:12-13` legger dem til. Den ble
aldri kjørt. Ikke en live feil: `MatchModeView.vue:244` kaller `startMatch`
uten config, så ingenting forsøker å skrive dem, og lesingen faller tilbake
på `|| 2` og `|| 30` (`MatchModeView.vue:462-463`). Konsekvensen er at
halvtid-lengde ikke er en funksjon i appen, selv om repoet påstår det.
Avgjør i fase 2: kjør migrasjonen, eller slett filen.

**2. `training_exercises.category` finnes i prod, men i ingen repo-fil.**
Lagt til direkte i dashbordet. Appen er avhengig av den —
`useExercises.js:26-27` grupperer øvelsesbanken på `category`. Bygget noen
databasen på nytt fra `.sql`-filene, ville øvelsesbanken mistet
grupperingen uten feilmelding.

Til sammen er dette beviset på at repoet ikke kan rekonstruere prod. Derfor
skal baseline komme fra `supabase db pull`, ikke fra filene.

## Bekreftet som planen antok

- `players.loan_eligible` **og** `player_season_teams.loan_eligible` finnes begge
- Global `UNIQUE(name)` på `players`, `coaches`, `referees` — blokkerer kull nr. 2
- `cup_matches.our_team` og `cup_squad.cup_team` har alle fire slugs i CHECK
- `expenses.paid_by → coaches(id)` uten `ON DELETE` — trenerraden må overleve
- `match_goals.player_id` og `cup_match_goals.player_id` er `ON DELETE RESTRICT`
- `match_sessions` har `match_id` som primærnøkkel

## Radtall

```
match_coaches       101      players              27
match_stints         79      expenses             19
matches              63      cup_matches          18
match_goals          59      cup_match_goals      16
player_season_teams  51      referees             10
match_players        44      training_exercises   10
cup_squad            43      match_sessions        6
                            seasons               3
auth.users            3      match_absences        3
                            training_sessions      3
                            cups                   2
                            training_periods       1
```

Ingenting nær API-taket på 1000 ennå. `match_stints` vokser raskest — den
får én rad per innbytte per kamp, og den er samtidig den eneste som leses
ufiltrert (`fetchAllStints`).

`auth.users = 3` er testbrukerne fra e-postoppsettet
(`alexander.samnoy@gmail.com`, `alexsamnoy1@hotmail.com`,
`alexander.samnoy+bb1@gmail.com`). De skal slettes i fase 2 — uten
medlemskap dukker de opp som «konto uten kull».
